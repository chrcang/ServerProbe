package model

// Metrics 系统监控指标数据模型
type Metrics struct {
	System        string  `json:"system"`        // 系统信息
	Uptime        string  `json:"uptime"`        // 运行时间
	Status        string  `json:"status"`        // 状态(在线/离线)
	Arch          string  `json:"arch"`          // 架构
	Region        string  `json:"region"`        // 区域
	CPUInfo       string  `json:"cpuInfo"`       // CPU信息
	Load          string  `json:"load"`          // 负载
	CPUUsage      float64 `json:"cpuUsage"`      // CPU使用率(%)
	MemUsed       uint64  `json:"memUsed"`       // 已用内存(字节)
	MemTotal      uint64  `json:"memTotal"`      // 总内存(字节)
	MemUsage      float64 `json:"memUsage"`      // 内存使用率(%)
	DiskUsed      uint64  `json:"diskUsed"`      // 已用磁盘(字节)
	DiskTotal     uint64  `json:"diskTotal"`     // 总磁盘(字节)
	DiskUsage     float64 `json:"diskUsage"`     // 磁盘使用率(%)
	UploadSpeed   uint64  `json:"uploadSpeed"`   // 上传速度(字节/秒)
	DownloadSpeed uint64  `json:"downloadSpeed"` // 下载速度(字节/秒)
	TotalUpload   uint64  `json:"totalUpload"`   // 总上传(字节)
	TotalDownload uint64  `json:"totalDownload"` // 总下载(字节)
}
