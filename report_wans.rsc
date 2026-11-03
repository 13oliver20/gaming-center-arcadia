# ==============================================================================
# Script de Telemetria de Red para Gaming Center Arcadia
# MikroTik RouterOS v6.49
# ==============================================================================

/system script
remove [find name="report_wans"]

add name=report_wans policy=read,write,test source={
:do {
  :local supUrl "https://gwxsoraznypiubuzkati.supabase.co/rest/v1/mikrotik_status?on_conflict=id"
  :local apikey "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eHNvcmF6bnlwaXVidXprYXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzY4NjUsImV4cCI6MjA4NzYxMjg2NX0.Swb1foJHVoK1Bqhh2FSkZUCh-SSPhTxoKX-Hkropkwc"
  :local headers ("apikey: " . $apikey . ",Authorization: Bearer " . $apikey . ",Content-Type: application/json,Prefer: resolution=merge-duplicates")

  # --- WAN 1 (ether1) ---
  :local rx1 0; :local tx1 0;
  /interface monitor-traffic ether1 once do={ :set rx1 $"rx-bits-per-second"; :set tx1 $"tx-bits-per-second" }
  :local rx1m ($rx1 / 1000000)
  :local tx1m ($tx1 / 1000000)
  :local p1 [/ping 192.168.10.1 count=2 interval=150ms]
  :local rtt1 0
  :if ($p1 > 0) do={ /tool flood-ping 192.168.10.1 count=2 do={ :set rtt1 $"avg-rtt" } }
  :local st1 "online"
  :local res1 "true"
  :if ($p1 = 0) do={ :set st1 "offline"; :set res1 "false" } else={ :if ($rx1 < 5000) do={ :set st1 "warning"; :set res1 "false" } }

  # --- WAN 2 (ether2) ---
  :local rx2 0; :local tx2 0;
  /interface monitor-traffic ether2 once do={ :set rx2 $"rx-bits-per-second"; :set tx2 $"tx-bits-per-second" }
  :local rx2m ($rx2 / 1000000)
  :local tx2m ($tx2 / 1000000)
  :local p2 [/ping 192.168.20.1 count=2 interval=150ms]
  :local rtt2 0
  :if ($p2 > 0) do={ /tool flood-ping 192.168.20.1 count=2 do={ :set rtt2 $"avg-rtt" } }
  :local st2 "online"
  :local res2 "true"
  :if ($p2 = 0) do={ :set st2 "offline"; :set res2 "false" } else={ :if ($rx2 < 5000) do={ :set st2 "warning"; :set res2 "false" } }

  # --- WAN 3 (ether3) ---
  :local rx3 0; :local tx3 0;
  /interface monitor-traffic ether3 once do={ :set rx3 $"rx-bits-per-second"; :set tx3 $"tx-bits-per-second" }
  :local rx3m ($rx3 / 1000000)
  :local tx3m ($tx3 / 1000000)
  :local p3 [/ping 192.168.30.1 count=2 interval=150ms]
  :local rtt3 0
  :if ($p3 > 0) do={ /tool flood-ping 192.168.30.1 count=2 do={ :set rtt3 $"avg-rtt" } }
  :local st3 "online"
  :local res3 "true"
  :if ($p3 = 0) do={ :set st3 "offline"; :set res3 "false" } else={ :if ($rx3 < 5000) do={ :set st3 "warning"; :set res3 "false" } }

  :local data ("[" . \
    "{\"id\":\"wan1\",\"nombre\":\"WAN 1: Movistar 500M\",\"interfaz\":\"ether1\",\"gateway\":\"192.168.10.1\",\"estado\":\"" . $st1 . "\",\"latencia_ms\":" . $rtt1 . ",\"rx_mbps\":" . $rx1m . ",\"tx_mbps\":" . $tx1m . ",\"resolviendo\":" . $res1 . "}," . \
    "{\"id\":\"wan2\",\"nombre\":\"WAN 2: Movistar 500M\",\"interfaz\":\"ether2\",\"gateway\":\"192.168.20.1\",\"estado\":\"" . $st2 . "\",\"latencia_ms\":" . $rtt2 . ",\"rx_mbps\":" . $rx2m . ",\"tx_mbps\":" . $tx2m . ",\"resolviendo\":" . $res2 . "}," . \
    "{\"id\":\"wan3\",\"nombre\":\"WAN 3: Movistar 500M\",\"interfaz\":\"ether3\",\"gateway\":\"192.168.30.1\",\"estado\":\"" . $st3 . "\",\"latencia_ms\":" . $rtt3 . ",\"rx_mbps\":" . $rx3m . ",\"tx_mbps\":" . $tx3m . ",\"resolviendo\":" . $res3 . "}" . \
  "]")

  /tool fetch url=$supUrl mode=https http-method=post http-header-field=$headers http-data=$data check-certificate=no keep-result=no
} on-error={
  :log warning "Error enviando metricas a Supabase"
}
}

/system scheduler
remove [find name="schedule_wans"]
add name=schedule_wans interval=30s on-event=report_wans start-time=startup
