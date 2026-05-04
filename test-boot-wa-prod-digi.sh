#!/bin/bash

HOST="10.70.0.118"
API_URL="http://$HOST"
PORTS=(8001 8002 8004 8005 8007 8009 8010)
NAMES=("wa-api-bkk" "wa-api-bapas" "wa-api-smartdesaku" "wa-api-gianyar" "wa-api-bangli" "wa-api-boyolali" "wa-api-purwodadi")
ADMIN_NUMBER="0895370034003"

# counter
SUCCESS_COUNT=0
FAILED_COUNT=0
DELAY_COUNT=0

# 🔐 input password
read -s -p "Masukkan password SSH: " SSH_PASS
echo ""

run_ssh() {
    sshpass -p "$SSH_PASS" ssh -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=5 userwhatsapp@$HOST "$1"
}

# test login
run_ssh "echo OK" >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Login SSH gagal"
    exit 1
fi

echo "✅ Login SSH berhasil"
echo "====================================="

for i in "${!PORTS[@]}"; do
    PORT=${PORTS[i]}
    NAME=${NAMES[i]}

    SEND_TIME=$(TZ="Asia/Jakarta" date '+%Y-%m-%d %H:%M:%S WIB')

    echo "🚀 $NAME (PORT: $PORT)"
    echo "🕒 Kirim: $SEND_TIME"

    curl -s -X POST $API_URL:$PORT/api/wa/whatsapp \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"Test\",\"content\":\"Tes WA\",\"destination\":\"$ADMIN_NUMBER\"}" > /dev/null

    SUCCESS=0
    ERROR_MSG=""

    for attempt in {1..3}; do
        sleep 3

        LOG=$(run_ssh "docker logs --tail 100 $NAME 2>/dev/null | tail -n 50")

        ACK_LINE=$(echo "$LOG" | grep "<ack class=\"message\"" | tail -n1)
        ERR_LINE=$(echo "$LOG" | grep -Ei "error|EOF|websocket|refused" | tail -n1)

        if [ -n "$ACK_LINE" ]; then
            ACK_TIME=$(TZ="Asia/Jakarta" date '+%Y-%m-%d %H:%M:%S WIB')

            echo "✅ TERKIRIM (PORT: $PORT)"
            echo "🕒 Diterima: $ACK_TIME"
            echo "📜 Bukti: $ACK_LINE"
            SUCCESS=1
            SUCCESS_COUNT=$((SUCCESS_COUNT+1))
            break
        fi

        if [ -n "$ERR_LINE" ]; then
            ERROR_MSG="$ERR_LINE"
        fi
    done

    if [ $SUCCESS -eq 0 ]; then
        if [ -n "$ERROR_MSG" ]; then
            echo "❌ GAGAL (PORT: $PORT)"
            echo "📜 Error: $ERROR_MSG"
            FAILED_COUNT=$((FAILED_COUNT+1))
        else
            echo "⚠️ DELAY / PROSES (PORT: $PORT)"
            DELAY_COUNT=$((DELAY_COUNT+1))
        fi
    fi

    echo "-------------------------------------"
done

# 🔥 SUMMARY AKHIR
TOTAL=${#PORTS[@]}

echo ""
echo "========== SUMMARY =========="
echo "Total Service : $TOTAL"
echo "✅ Berhasil    : $SUCCESS_COUNT"
echo "❌ Gagal      : $FAILED_COUNT"
echo "⚠️ Delay      : $DELAY_COUNT"
echo "============================="
