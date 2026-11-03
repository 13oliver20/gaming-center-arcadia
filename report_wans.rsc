# ========================================================
# GAMING CENTER ARCADIA - TELEMETRIA WAN MIKROTIK
# RouterOS v6.49 - Monitoreo de 3 Lineas WAN
# ========================================================

# 1. Asegurar rutas fijas para cada prueba independiente por WAN
/ip route remove [find comment="PING_WAN1"]
/ip route remove [find comment="PING_WAN2"]
/ip route remove [find comment="PING_WAN3"]
/ip route add dst-address=8.8.8.8/32 gateway=192.168.10.1 comment="PING_WAN1"
/ip route add dst-address=1.1.1.1/32 gateway=192.168.20.1 comment="PING_WAN2"
/ip route add dst-address=9.9.9.9/32 gateway=192.168.30.1 comment="PING_WAN3"

# 2. Crear o actualizar el script report_wans
/system script remove [find name="report_wans"]
/system script add name="report_wans" policy=read,write,test source=":do {\r\
\n  :local supUrl \"https://gwxsoraznypiubuzkati.supabase.co/rest/v1/mikrotik_status?on_conflict=id\"\r\
\n  :local apikey \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eHNvcmF6bnlwaXVidXprYXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzY4NjUsImV4cCI6MjA4NzYxMjg2NX0.Swb1foJHVoK1Bqhh2FSkZUCh-SSPhTxoKX-Hkropkwc\"\r\
\n  :local headers (\"apikey: \" . \$apikey . \",Authorization: Bearer \" . \$apikey . \",Content-Type: application/json,Prefer: resolution=merge-duplicates\")\r\
\n\r\
\n  # --- WAN 1 (ether1) -> 8.8.8.8 ---\r\
\n  :local rx1 0; :local tx1 0;\r\
\n  /interface monitor-traffic ether1 once do={ :set rx1 \$\"rx-bits-per-second\"; :set tx1 \$\"tx-bits-per-second\" }\r\
\n  :local rx1m (\$rx1 / 1000000)\r\
\n  :local tx1m (\$tx1 / 1000000)\r\
\n  :local p1 [/ping 8.8.8.8 count=30 interval=50ms]\r\
\n  :local rtt1 0\r\
\n  /tool flood-ping 8.8.8.8 count=10 do={ :if (\$sent = 10) do={ :set rtt1 \$\"avg-rtt\" } }\r\
\n  :local st1 (\$p1 . \"/30\")\r\
\n  :local res1 \"true\"\r\
\n  :if (\$p1 = 0) do={ :set res1 \"false\" }\r\
\n\r\
\n  # --- WAN 2 (ether2) -> 1.1.1.1 ---\r\
\n  :local rx2 0; :local tx2 0;\r\
\n  /interface monitor-traffic ether2 once do={ :set rx2 \$\"rx-bits-per-second\"; :set tx2 \$\"tx-bits-per-second\" }\r\
\n  :local rx2m (\$rx2 / 1000000)\r\
\n  :local tx2m (\$tx2 / 1000000)\r\
\n  :local p2 [/ping 1.1.1.1 count=30 interval=50ms]\r\
\n  :local rtt2 0\r\
\n  /tool flood-ping 1.1.1.1 count=10 do={ :if (\$sent = 10) do={ :set rtt2 \$\"avg-rtt\" } }\r\
\n  :local st2 (\$p2 . \"/30\")\r\
\n  :local res2 \"true\"\r\
\n  :if (\$p2 = 0) do={ :set res2 \"false\" }\r\
\n\r\
\n  # --- WAN 3 (ether3) -> 9.9.9.9 ---\r\
\n  :local rx3 0; :local tx3 0;\r\
\n  /interface monitor-traffic ether3 once do={ :set rx3 \$\"rx-bits-per-second\"; :set tx3 \$\"tx-bits-per-second\" }\r\
\n  :local rx3m (\$rx3 / 1000000)\r\
\n  :local tx3m (\$tx3 / 1000000)\r\
\n  :local p3 [/ping 9.9.9.9 count=30 interval=50ms]\r\
\n  :local rtt3 0\r\
\n  /tool flood-ping 9.9.9.9 count=10 do={ :if (\$sent = 10) do={ :set rtt3 \$\"avg-rtt\" } }\r\
\n  :local st3 (\$p3 . \"/30\")\r\
\n  :local res3 \"true\"\r\
\n  :if (\$p3 = 0) do={ :set res3 \"false\" }\r\
\n\r\
\n  :local data (\"[\" . \\\r\
\n    \"{\\\"id\\\":\\\"wan1\\\",\\\"nombre\\\":\\\"WAN 1: Movistar 500M\\\",\\\"interfaz\\\":\\\"ether1\\\",\\\"gateway\\\":\\\"192.168.10.1\\\",\\\"estado\\\":\\\"\" . \$st1 . \"\\\",\\\"latencia_ms\\\":\" . \$rtt1 . \",\\\"rx_mbps\\\":\" . \$rx1m . \",\\\"tx_mbps\\\":\" . \$tx1m . \",\\\"resolviendo\\\":\" . \$res1 . \"},\" . \\\r\
\n    \"{\\\"id\\\":\\\"wan2\\\",\\\"nombre\\\":\\\"WAN 2: Movistar 500M\\\",\\\"interfaz\\\":\\\"ether2\\\",\\\"gateway\\\":\\\"192.168.20.1\\\",\\\"estado\\\":\\\"\" . \$st2 . \"\\\",\\\"latencia_ms\\\":\" . \$rtt2 . \",\\\"rx_mbps\\\":\" . \$rx2m . \",\\\"tx_mbps\\\":\" . \$tx2m . \",\\\"resolviendo\\\":\" . \$res2 . \"},\" . \\\r\
\n    \"{\\\"id\\\":\\\"wan3\\\",\\\"nombre\\\":\\\"WAN 3: Movistar 500M\\\",\\\"interfaz\\\":\\\"ether3\\\",\\\"gateway\\\":\\\"192.168.30.1\\\",\\\"estado\\\":\\\"\" . \$st3 . \"\\\",\\\"latencia_ms\\\":\" . \$rtt3 . \",\\\"rx_mbps\\\":\" . \$rx3m . \",\\\"tx_mbps\\\":\" . \$tx3m . \",\\\"resolviendo\\\":\" . \$res3 . \"}\" . \\\r\
\n  \"]\")\r\
\n\r\
\n  /tool fetch url=\$supUrl mode=https http-method=post http-header-field=\$headers http-data=\$data check-certificate=no keep-result=no\r\
\n  :log info \"Metricas WAN enviadas correctamente a Supabase (cada 30s)\"\r\
\n} on-error={\r\
\n  :log warning \"Error enviando metricas a Supabase\"\r\
\n}"

# 3. Configurar el Scheduler cada 30 segundos
/system scheduler remove [find name="schedule_wans"]
/system scheduler add name="schedule_wans" interval=30s on-event="report_wans" start-time=startup
