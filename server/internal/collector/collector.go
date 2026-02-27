package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	psnet "github.com/shirou/gopsutil/v4/net"

	"Monitoring/internal/model"
)

// Collector 周期性采集系统指标。
// 设计原则：只读采集，不执行任何系统写操作或 shell 命令。
type Collector struct {
	mu        sync.RWMutex
	metrics   model.Metrics
	prevNetIO psnet.IOCountersStat
	prevTime  time.Time

	regionMu      sync.Mutex
	region        string    // 缓存的区域信息
	regionUpdated time.Time // 上次获取区域信息的时间
}

// New 创建采集器实例
func New() *Collector {
	return &Collector{}
}

// GetMetrics 获取最新指标快照（线程安全）
func (c *Collector) GetMetrics() model.Metrics {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.metrics
}

// Run 启动周期性采集（每2秒），阻塞直到 ctx 取消
func (c *Collector) Run(ctx context.Context) {
	// 初始化网络计数器基准值
	if counters, err := psnet.IOCountersWithContext(ctx, false); err == nil && len(counters) > 0 {
		c.prevNetIO = counters[0]
	}
	c.prevTime = time.Now()

	// 预热 CPU 采样（gopsutil 首次调用 Percent(0) 返回值不准确）
	_, _ = cpu.PercentWithContext(ctx, 0, false)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	c.collect(ctx) // 立即采集一次

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.collect(ctx)
		}
	}
}

// collect 执行一次完整的指标采集
func (c *Collector) collect(ctx context.Context) {
	m := model.Metrics{Status: "在线"}

	c.collectHost(ctx, &m)
	c.collectCPU(ctx, &m)
	c.collectMemory(ctx, &m)
	c.collectDisk(ctx, &m)
	c.collectNetwork(ctx, &m)

	c.mu.Lock()
	c.metrics = m
	c.mu.Unlock()
}

// collectHost 采集主机信息：系统、运行时间、架构、区域
func (c *Collector) collectHost(ctx context.Context, m *model.Metrics) {
	if info, err := host.InfoWithContext(ctx); err == nil {
		m.System = simplifyOS(info.Platform)
		m.Uptime = formatUptime(info.Uptime)
		m.Arch = info.KernelArch
	}
	if m.Arch == "" {
		m.Arch = runtime.GOARCH
	}
	c.regionMu.Lock()
	if c.region == "" || time.Since(c.regionUpdated) >= 5*time.Minute {
		c.region = fetchRegion()
		c.regionUpdated = time.Now()
	}
	c.regionMu.Unlock()
	m.Region = c.region
}

// collectCPU 采集 CPU 信息、使用率、负载
func (c *Collector) collectCPU(ctx context.Context, m *model.Metrics) {
	// CPU 型号与核心数
	if infos, err := cpu.InfoWithContext(ctx); err == nil && len(infos) > 0 {
		m.CPUInfo = fmt.Sprintf("%s (%d核)", infos[0].ModelName, runtime.NumCPU())
	}

	// CPU 使用率
	var cpuPercent float64
	if pcts, err := cpu.PercentWithContext(ctx, 0, false); err == nil && len(pcts) > 0 {
		cpuPercent = pcts[0]
		m.CPUUsage = math.Round(cpuPercent*100) / 100
	}

	// 负载（Windows 无 load average，使用 CPU 使用率替代）
	if avg, err := load.AvgWithContext(ctx); err == nil {
		m.Load = fmt.Sprintf("%.2f / %.2f / %.2f", avg.Load1, avg.Load5, avg.Load15)
	} else {
		m.Load = fmt.Sprintf("%.1f%%", cpuPercent)
	}
}

// collectMemory 采集内存使用情况
func (c *Collector) collectMemory(ctx context.Context, m *model.Metrics) {
	if v, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		m.MemUsed = v.Used
		m.MemTotal = v.Total
		m.MemUsage = math.Round(v.UsedPercent*100) / 100
	}
}

// collectDisk 采集磁盘使用情况
func (c *Collector) collectDisk(ctx context.Context, m *model.Metrics) {
	if d, err := disk.UsageWithContext(ctx, systemDisk()); err == nil {
		m.DiskUsed = d.Used
		m.DiskTotal = d.Total
		m.DiskUsage = math.Round(d.UsedPercent*100) / 100
	}
}

// collectNetwork 采集网络速度与总流量
func (c *Collector) collectNetwork(ctx context.Context, m *model.Metrics) {
	now := time.Now()
	counters, err := psnet.IOCountersWithContext(ctx, false)
	if err != nil || len(counters) == 0 {
		return
	}

	elapsed := now.Sub(c.prevTime).Seconds()
	if elapsed > 0 {
		sent := counters[0].BytesSent
		recv := counters[0].BytesRecv
		m.UploadSpeed = uint64(float64(sent-c.prevNetIO.BytesSent) / elapsed)
		m.DownloadSpeed = uint64(float64(recv-c.prevNetIO.BytesRecv) / elapsed)
	}

	m.TotalUpload = counters[0].BytesSent
	m.TotalDownload = counters[0].BytesRecv
	c.prevNetIO = counters[0]
	c.prevTime = now
}

// formatUptime
func formatUptime(seconds uint64) string {
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	minutes := (seconds % 3600) / 60
	switch {
	case days > 0:
		return fmt.Sprintf("%d天 %d时 %d分", days, hours, minutes)
	case hours > 0:
		return fmt.Sprintf("%d时 %d分", hours, minutes)
	default:
		return fmt.Sprintf("%d分", minutes)
	}
}

// simplifyOS 将平台信息简化为简短的系统名称
func simplifyOS(platform string) string {
	p := strings.ToLower(platform)
	switch {
	case strings.Contains(p, "windows"):
		return "Windows"
	case strings.Contains(p, "ubuntu"):
		return "Ubuntu"
	case strings.Contains(p, "debian"):
		return "Debian"
	case strings.Contains(p, "centos"):
		return "CentOS"
	case strings.Contains(p, "fedora"):
		return "Fedora"
	case strings.Contains(p, "arch"):
		return "Arch Linux"
	case strings.Contains(p, "alpine"):
		return "Alpine"
	case strings.Contains(p, "darwin"), strings.Contains(p, "macos"):
		return "macOS"
	default:
		if platform != "" {
			return strings.ToUpper(platform[:1]) + platform[1:]
		}
		return runtime.GOOS
	}
}

// ipInfoResp IP 查询接口响应（只解析需要的字段）
type ipInfoResp struct {
	Country string `json:"country"`
}

// fetchRegion 通过公网 IP 查询接口获取国家区域信息
func fetchRegion() string {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("http://ip-api.com/json/?fields=country&lang=zh-CN")
	if err != nil {
		return "Unknown"
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "Unknown"
	}

	var info ipInfoResp
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil || info.Country == "" {
		return "Unknown"
	}
	return info.Country
}

// systemDisk 返回当前操作系统的系统磁盘根路径
func systemDisk() string {
	if runtime.GOOS == "windows" {
		return "C:\\"
	}
	return "/"
}
