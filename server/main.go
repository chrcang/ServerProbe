package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"

	"Monitoring/internal/collector"
	"Monitoring/internal/server"
)

func main() {
	addr := flag.String("addr", ":9527", "监听地址 (例: :8080, 127.0.0.1:9090)")
	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	c := collector.New()
	go c.Run(ctx)

	srv := server.New(*addr, c)

	fmt.Printf("服务器探针已启动: http://localhost%s\n", *addr)

	if err := srv.Run(ctx); err != nil && err != http.ErrServerClosed {
		log.Fatalf("服务器启动失败: %v\n", err)
	}
}
