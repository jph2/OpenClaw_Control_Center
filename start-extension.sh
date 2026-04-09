#!/bin/bash

# OpenClaw UI Extensions - Auto-Start Script
# This script starts all extension services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="/tmp/openclaw-extensions"

mkdir -p "$PID_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

start_workbench() {
    local pidfile="$PID_DIR/workbench.pid"
    
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
        log "Workbench already running (PID: $(cat "$pidfile"))"
        return 0
    fi
    
    log "Starting Workbench..."
    cd "$SCRIPT_DIR" && npm start > /tmp/workbench.log 2>&1 &
    echo $! > "$pidfile"
    
    for i in {1..30}; do
        if curl -s http://localhost:4260 > /dev/null 2>&1; then
            log "✅ Workbench ready on http://localhost:4260"
            return 0
        fi
        sleep 1
    done
    
    log "❌ Workbench failed to start (check /tmp/workbench.log)"
    return 1
}

start_channel_manager() {
    local pidfile="$PID_DIR/channel-manager.pid"
    
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
        log "Channel Manager already running (PID: $(cat "$pidfile"))"
        return 0
    fi
    
    log "Starting Channel Manager..."
    cd "$SCRIPT_DIR/channel_CHAT-manager" && CHANNEL_MANAGER_PORT=3402 node server.js > /tmp/channel-manager.log 2>&1 &
    echo $! > "$pidfile"
    
    for i in {1..30}; do
        if curl -s http://localhost:3402 > /dev/null 2>&1; then
            log "✅ Channel Manager ready on http://localhost:3402"
            return 0
        fi
        sleep 1
    done
    
    log "❌ Channel Manager failed to start (check /tmp/channel-manager.log)"
    return 1
}

start_landing() {
    local pidfile="$PID_DIR/landing.pid"
    
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
        log "Landing Page already running (PID: $(cat "$pidfile"))"
        return 0
    fi
    
    log "Starting Landing Page..."
    cd "$SCRIPT_DIR" && node landing-server.js > /tmp/landing.log 2>&1 &
    echo $! > "$pidfile"
    
    for i in {1..30}; do
        if curl -s http://localhost:8080 > /dev/null 2>&1; then
            log "✅ Landing Page ready on http://localhost:8080"
            return 0
        fi
        sleep 1
    done
    
    log "❌ Landing Page failed to start (check /tmp/landing.log)"
    return 1
}

open_browser() {
    local url="http://localhost:8080"
    
    if command -v xdg-open &> /dev/null; then
        xdg-open "$url" &
    elif command -v open &> /dev/null; then
        open "$url" &
    elif command -v firefox &> /dev/null; then
        firefox "$url" &
    elif command -v chromium &> /dev/null; then
        chromium "$url" &
    else
        log "📄 Open: $url"
    fi
}

stop_all() {
    log "Stopping all services..."
    
    for service in workbench channel-manager landing; do
        local pidfile="$PID_DIR/$service.pid"
        if [ -f "$pidfile" ]; then
            local pid=$(cat "$pidfile")
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null
                log "Stopped $service (PID: $pid)"
            fi
            rm -f "$pidfile"
        fi
    done
    
    log "✅ All services stopped"
}

status() {
    log "Extension Status:"
    
    declare -A ports=(
        [workbench]=4260
        [channel-manager]=3402
        [landing]=8080
    )
    
    for service in workbench channel-manager landing; do
        local pidfile="$PID_DIR/$service.pid"
        local port=${ports[$service]}
        
        if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
            log "  $service: ✅ Running (PID: $(cat "$pidfile"), Port: $port)"
        else
            log "  $service: ❌ Stopped (Port: $port)"
        fi
    done
}

# Main
case "${1:-start}" in
    start)
        log "=== Starting OpenClaw UI Extensions ==="
        start_workbench
        start_channel_manager
        start_landing
        log "=== All services started ==="
        log ""
        log "🌐 Landing Page:   http://localhost:8080"
        log "📁 Workbench:      http://localhost:4260"
        log "📺 Channel Manager: http://localhost:3402"
        log ""
        open_browser
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        sleep 2
        $0 start
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 [start|stop|restart|status]"
        echo ""
        echo "Commands:"
        echo "  start   - Start all extension services"
        echo "  stop    - Stop all extension services"
        echo "  restart - Restart all extension services"
        echo "  status  - Check service status"
        ;;
esac
