package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"Monitoring/internal/collector"
)

// Server HTTP 服务器，提供 JSON API
type Server struct {
	collector *collector.Collector
	addr      string
}

// New 创建 HTTP 服务器实例
func New(addr string, c *collector.Collector) *Server {
	return &Server{
		collector: c,
		addr:      addr,
	}
}

// Run 启动 HTTP 服务，阻塞直到 ctx 取消
func (s *Server) Run(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/metrics", s.handleMetrics)

	srv := &http.Server{
		Addr:              s.addr,
		Handler:           securityHeaders(readOnlyGuard(mux)),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	return srv.ListenAndServe()
}

// securityHeaders 添加安全响应头，防止点击劫持、MIME 嗅探等攻击
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

// readOnlyGuard 仅允许 GET 请求，拒绝所有写操作
func readOnlyGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// handleMetrics 返回当前指标 JSON
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(s.collector.GetMetrics())
}
