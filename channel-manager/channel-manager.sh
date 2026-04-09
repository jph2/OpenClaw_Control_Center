#!/bin/bash

# OpenClaw Channel Manager CLI
# Usage: channel-manager [command]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="$SCRIPT_DIR/channel_config.json"
PID_FILE="/tmp/channel-manager.pid"
PORT="${CHANNEL_MANAGER_PORT:-3401}"

show_help() {
    cat << EOF
OpenClaw Channel Manager

Commands:
    start           Start the server
    stop            Stop the server
    restart         Restart the server
    status          Check server status
    open            Open the UI in browser
    config          Edit configuration
    validate        Validate configuration
    list            List all channels
    
Environment:
    CHANNEL_MANAGER_PORT    Server port (default: 3401)

Examples:
    channel-manager start
    channel-manager open
    channel-manager list
EOF
}

start_server() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "Channel Manager is already running (PID: $(cat "$PID_FILE"))"
        echo "Open: http://127.0.0.1:$PORT"
        return
    fi
    
    echo "Starting Channel Manager on port $PORT..."
    cd "$SCRIPT_DIR" && node server.js &
    echo $! > "$PID_FILE"
    sleep 2
    
    if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "✅ Channel Manager started"
        echo "Open: http://127.0.0.1:$PORT"
    else
        echo "❌ Failed to start"
        rm -f "$PID_FILE"
    fi
}

stop_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            rm -f "$PID_FILE"
            echo "✅ Channel Manager stopped"
        else
            echo "Not running"
            rm -f "$PID_FILE"
        fi
    else
        echo "Not running"
    fi
}

check_status() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "✅ Channel Manager is running (PID: $(cat "$PID_FILE"))"
        echo "URL: http://127.0.0.1:$PORT"
        
        # Show channel count
        if [ -f "$CONFIG_PATH" ]; then
            CHANNELS=$(grep -c '"id"' "$CONFIG_PATH" 2>/dev/null || echo "0")
            echo "Channels: $CHANNELS"
        fi
    else
        echo "❌ Channel Manager is not running"
    fi
}

open_ui() {
    URL="http://127.0.0.1:$PORT"
    
    # Try different browsers
    if command -v xdg-open &> /dev/null; then
        xdg-open "$URL"
    elif command -v open &> /dev/null; then
        open "$URL"
    elif command -v firefox &> /dev/null; then
        firefox "$URL"
    elif command -v chromium &> /dev/null; then
        chromium "$URL"
    else
        echo "Open: $URL"
    fi
}

edit_config() {
    ${EDITOR:-nano} "$CONFIG_PATH"
}

validate_config() {
    if [ ! -f "$CONFIG_PATH" ]; then
        echo "❌ Config file not found: $CONFIG_PATH"
        return 1
    fi
    
    if node -e "JSON.parse(require('fs').readFileSync('$CONFIG_PATH'))" 2>/dev/null; then
        echo "✅ Configuration is valid JSON"
        
        # Count channels
        CHANNELS=$(grep -c '"id"' "$CONFIG_PATH" 2>/dev/null || echo "0")
        echo "Channels: $CHANNELS"
        
        # List channels
        echo ""
        echo "Configured channels:"
        node -e "
            const config = JSON.parse(require('fs').readFileSync('$CONFIG_PATH'));
            config.channels.forEach((c, i) => {
                console.log(\`  \${i + 1}. \${c.name} (\${c.id})\`);
                console.log(\`     Model: \${c.model}\`);
                console.log(\`     Skills: \${(c.skills || []).join(', ') || 'none'}\`);
            });
        "
    else
        echo "❌ Configuration is invalid JSON"
        return 1
    fi
}

list_channels() {
    if [ ! -f "$CONFIG_PATH" ]; then
        echo "No configuration found"
        return
    fi
    
    node -e "
        const config = JSON.parse(require('fs').readFileSync('$CONFIG_PATH'));
        console.log('Channels:');
        config.channels.forEach((c, i) => {
            console.log(\`\${i + 1}. \${c.name}\`);
            console.log(\`   ID: \${c.id}\`);
            console.log(\`   Model: \${c.model}\`);
            console.log(\`   Skills: \${(c.skills || []).join(', ') || 'none'}\`);
            console.log(\`   Require mention: \${c.require_mention ? 'yes' : 'no'}\`);
            console.log('');
        });
    "
}

# Main
case "${1:-}" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 1
        start_server
        ;;
    status)
        check_status
        ;;
    open)
        open_ui
        ;;
    config)
        edit_config
        ;;
    validate)
        validate_config
        ;;
    list)
        list_channels
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        check_status
        echo ""
        echo "Usage: channel-manager [start|stop|restart|status|open|config|validate|list]"
        ;;
esac
