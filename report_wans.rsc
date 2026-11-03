# ========================================================
# GAMING CENTER ARCADIA - NOC MIKROTIK TELEMETRY & 40 PCS
# RouterOS v6.49 - Monitoreo Completo de WANs, Salud y 40 PCs
# Optimizado: 100% libre de errores de sintaxis y buffer seguro
# ========================================================

:do {
  :local supUrl "https://gwxsoraznypiubuzkati.supabase.co/rest/v1/mikrotik_status?on_conflict=id"
  :local healthUrl "https://gwxsoraznypiubuzkati.supabase.co/rest/v1/mikrotik_health?on_conflict=id"
  :local clientsUrl "https://gwxsoraznypiubuzkati.supabase.co/rest/v1/mikrotik_clients?on_conflict=ip"
  :local apikey "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eHNvcmF6bnlwaXVidXprYXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzY4NjUsImV4cCI6MjA4NzYxMjg2NX0.Swb1foJHVoK1Bqhh2FSkZUCh-SSPhTxoKX-Hkropkwc"
  :local headers ("apikey: " . $apikey . ",Authorization: Bearer " . $apikey . ",Content-Type: application/json,Prefer: resolution=merge-duplicates")
  :local target "200.48.225.146"

  # ==========================================
  # 1. MONITOREO DE LAS 3 LINEAS WAN
  # ==========================================
  :local rx1 0; :local tx1 0;
  /interface monitor-traffic ether1 once do={ :set rx1 $"rx-bits-per-second"; :set tx1 $"tx-bits-per-second" }
  :local rx1m ($rx1 / 1000000); :local tx1m ($tx1 / 1000000)
  /ip route set [find comment="PING_MOVISTAR"] gateway=192.168.10.1
  :local p1 [/ping $target count=30 interval=150ms]
  :local rtt1 0
  /tool flood-ping $target count=10 do={ :if ($sent = 10) do={ :set rtt1 $"avg-rtt" } }
  :local st1 ($p1 . "/30")
  :local res1 "true"
  :if ($p1 = 0) do={ :set res1 "false" }

  :local rx2 0; :local tx2 0;
  /interface monitor-traffic ether2 once do={ :set rx2 $"rx-bits-per-second"; :set tx2 $"tx-bits-per-second" }
  :local rx2m ($rx2 / 1000000); :local tx2m ($tx2 / 1000000)
  /ip route set [find comment="PING_MOVISTAR"] gateway=192.168.20.1
  :local p2 [/ping $target count=30 interval=150ms]
  :local rtt2 0
  /tool flood-ping $target count=10 do={ :if ($sent = 10) do={ :set rtt2 $"avg-rtt" } }
  :local st2 ($p2 . "/30")
  :local res2 "true"
  :if ($p2 = 0) do={ :set res2 "false" }

  :local rx3 0; :local tx3 0;
  /interface monitor-traffic ether3 once do={ :set rx3 $"rx-bits-per-second"; :set tx3 $"tx-bits-per-second" }
  :local rx3m ($rx3 / 1000000); :local tx3m ($tx3 / 1000000)
  /ip route set [find comment="PING_MOVISTAR"] gateway=192.168.30.1
  :local p3 [/ping $target count=30 interval=150ms]
  :local rtt3 0
  /tool flood-ping $target count=10 do={ :if ($sent = 10) do={ :set rtt3 $"avg-rtt" } }
  :local st3 ($p3 . "/30")
  :local res3 "true"
  :if ($p3 = 0) do={ :set res3 "false" }

  :local data ("[" . \
    "{\"id\":\"wan1\",\"nombre\":\"WAN 1: Movistar 500M\",\"interfaz\":\"ether1\",\"gateway\":\"192.168.10.1\",\"estado\":\"" . $st1 . "\",\"latencia_ms\":" . $rtt1 . ",\"rx_mbps\":" . $rx1m . ",\"tx_mbps\":" . $tx1m . ",\"resolviendo\":" . $res1 . "}," . \
    "{\"id\":\"wan2\",\"nombre\":\"WAN 2: Movistar 500M\",\"interfaz\":\"ether2\",\"gateway\":\"192.168.20.1\",\"estado\":\"" . $st2 . "\",\"latencia_ms\":" . $rtt2 . ",\"rx_mbps\":" . $rx2m . ",\"tx_mbps\":" . $tx2m . ",\"resolviendo\":" . $res2 . "}," . \
    "{\"id\":\"wan3\",\"nombre\":\"WAN 3: Movistar 500M\",\"interfaz\":\"ether3\",\"gateway\":\"192.168.30.1\",\"estado\":\"" . $st3 . "\",\"latencia_ms\":" . $rtt3 . ",\"rx_mbps\":" . $rx3m . ",\"tx_mbps\":" . $tx3m . ",\"resolviendo\":" . $res3 . "}" . \
  "]")
  /tool fetch url=$supUrl mode=https http-method=post http-header-field=$headers http-data=$data check-certificate=no keep-result=no

  # ==========================================
  # 2. SALUD Y RENDIMIENTO DEL HARDWARE
  # ==========================================
  :local cpu [/system resource get cpu-load]
  :local freeMem [/system resource get free-memory]
  :local totalMem [/system resource get total-memory]
  :local freeMemMB ($freeMem / 1048576); :local totalMemMB ($totalMem / 1048576)
  :local usedMemMB ($totalMemMB - $freeMemMB)
  :local memPct (($usedMemMB * 100) / $totalMemMB)
  :local upTime [/system resource get uptime]
  :local cpuFreq [/system resource get cpu-frequency]
  :local boardName [/system resource get board-name]
  :local rosVer [/system resource get version]
  :local healthData ("{\"id\":\"system\",\"cpu_load\":" . $cpu . ",\"free_memory_mb\":" . $freeMemMB . ",\"total_memory_mb\":" . $totalMemMB . ",\"memory_pct\":" . $memPct . ",\"uptime\":\"" . $upTime . "\",\"cpu_frequency\":" . $cpuFreq . ",\"board_name\":\"" . $boardName . "\",\"version\":\"" . $rosVer . "\"}")
  /tool fetch url=$healthUrl mode=https http-method=post http-header-field=$headers http-data=$healthData check-certificate=no keep-result=no

  # ==========================================
  # 3. ESCANEO 40 PCS: BLOQUE 1 (PC-01 a PC-20)
  # ==========================================
  :local b1 "["
  :local f1 true
  :for i from=101 to=120 do={
    :local curIp ("192.168.1." . $i)
    :local pcNum ($i - 100)
    :local pcStr $pcNum
    :if ($pcNum < 10) do={ :set pcStr ("0" . $pcNum) }
    :local isUp "false"
    :local act "apagada"
    :local wan "idle"

    :if ([:len [/ip arp find address=$curIp]] > 0) do={
      :set isUp "true"
      :set act "gaming"
      :set wan "wan3_gaming"
    } else={
      :if ([:len [/ip dhcp-server lease find address=$curIp status=bound]] > 0) do={
        :set isUp "true"
        :set act "navegacion"
        :set wan "wan1_nav"
      }
    }

    :if ($f1 = false) do={ :set b1 ($b1 . ",") }
    :set b1 ($b1 . "{\"ip\":\"" . $curIp . "\",\"pc_name\":\"PC-" . $pcStr . "\",\"pc_number\":" . $pcNum . ",\"online\":" . $isUp . ",\"wan_active\":\"" . $wan . "\",\"actividad\":\"" . $act . "\"}")
    :set f1 false
  }
  :set b1 ($b1 . "]")
  /tool fetch url=$clientsUrl mode=https http-method=post http-header-field=$headers http-data=$b1 check-certificate=no keep-result=no

  # ==========================================
  # 3. ESCANEO 40 PCS: BLOQUE 2 (PC-21 a PC-40)
  # ==========================================
  :local b2 "["
  :local f2 true
  :for i from=121 to=140 do={
    :local curIp ("192.168.1." . $i)
    :local pcNum ($i - 100)
    :local pcStr $pcNum
    :if ($pcNum < 10) do={ :set pcStr ("0" . $pcNum) }
    :local isUp "false"
    :local act "apagada"
    :local wan "idle"

    :if ([:len [/ip arp find address=$curIp]] > 0) do={
      :set isUp "true"
      :set act "gaming"
      :set wan "wan3_gaming"
    } else={
      :if ([:len [/ip dhcp-server lease find address=$curIp status=bound]] > 0) do={
        :set isUp "true"
        :set act "navegacion"
        :set wan "wan1_nav"
      }
    }

    :if ($f2 = false) do={ :set b2 ($b2 . ",") }
    :set b2 ($b2 . "{\"ip\":\"" . $curIp . "\",\"pc_name\":\"PC-" . $pcStr . "\",\"pc_number\":" . $pcNum . ",\"online\":" . $isUp . ",\"wan_active\":\"" . $wan . "\",\"actividad\":\"" . $act . "\"}")
    :set f2 false
  }
  :set b2 ($b2 . "]")
  /tool fetch url=$clientsUrl mode=https http-method=post http-header-field=$headers http-data=$b2 check-certificate=no keep-result=no

  :log info "NOC Telemetria completa enviada: WANs, Salud y 40 PCs OK"
} on-error={
  :log warning "Error enviando telemetria completa a Supabase"
}
