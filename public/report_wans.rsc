# ========================================================
# GAMING CENTER ARCADIA - NOC MIKROTIK TELEMETRY & 40 PCS
# Versión: V5 Integrada - RouterOS v6.49.23
# - 100% Compatible con Script Final V5 (Faros fijos sin tocar tabla de rutas)
# - Detección real de WANs (WAN 3 Juegos, WAN 1 y WAN 2 Navegación)
# - Clasificación de 40 PCs: Online/Offline, Tráfico en KB/s y Estado WAN
# ========================================================

:do {
  :local supUrl "https://gwxsoraznypiubuzkati.supabase.co/rest/v1/mikrotik_status?on_conflict=id"
  :local healthUrl "https://gwxsoraznypiubuzkati.supabase.co/rest/v1/mikrotik_health?on_conflict=id"
  :local clientsUrl "https://gwxsoraznypiubuzkati.supabase.co/rest/v1/mikrotik_clients?on_conflict=ip"
  :local apikey "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3eHNvcmF6bnlwaXVidXprYXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzY4NjUsImV4cCI6MjA4NzYxMjg2NX0.Swb1foJHVoK1Bqhh2FSkZUCh-SSPhTxoKX-Hkropkwc"
  :local headers ("apikey: " . $apikey . ",Authorization: Bearer " . $apikey . ",Content-Type: application/json,Prefer: resolution=merge-duplicates")

  # ==========================================
  # 1. MONITOREO DE LAS 3 LÍNEAS WAN (FAROS NATIVOS V5)
  # ==========================================

  # --- WAN 1 (ether1) -> Gateway 192.168.10.1 -> Faro V5: 200.48.225.146 ---
  :local rx1 0; :local tx1 0
  /interface monitor-traffic ether1 once do={ :set rx1 $"rx-bits-per-second"; :set tx1 $"tx-bits-per-second" }
  :local rx1m ($rx1 / 1000000); :local tx1m ($tx1 / 1000000)
  :local gw1Up [/ping 192.168.10.1 count=2 interval=100ms]
  :local p1 0; :local rtt1 0; :local st1 "0/30"; :local res1 "false"
  :if ($gw1Up > 0) do={
    :set p1 [/ping 200.48.225.146 count=30 interval=100ms]
    :if ($p1 > 0) do={
      /tool flood-ping 200.48.225.146 count=5 do={ :if ($sent = 5) do={ :set rtt1 $"avg-rtt" } }
      :set res1 "true"
    }
    :set st1 ($p1 . "/30")
  } else={
    :set rx1m 0; :set tx1m 0
  }

  # --- WAN 2 (ether2) -> Gateway 192.168.20.1 -> Faro V5: 200.48.225.130 ---
  :local rx2 0; :local tx2 0
  /interface monitor-traffic ether2 once do={ :set rx2 $"rx-bits-per-second"; :set tx2 $"tx-bits-per-second" }
  :local rx2m ($rx2 / 1000000); :local tx2m ($tx2 / 1000000)
  :local gw2Up [/ping 192.168.20.1 count=2 interval=100ms]
  :local p2 0; :local rtt2 0; :local st2 "0/30"; :local res2 "false"
  :if ($gw2Up > 0) do={
    :set p2 [/ping 200.48.225.130 count=30 interval=100ms]
    :if ($p2 > 0) do={
      /tool flood-ping 200.48.225.130 count=5 do={ :if ($sent = 5) do={ :set rtt2 $"avg-rtt" } }
      :set res2 "true"
    }
    :set st2 ($p2 . "/30")
  } else={
    :set rx2m 0; :set tx2m 0
  }

  # --- WAN 3 (ether3) -> Gateway 192.168.30.1 -> Faro V5: 8.8.8.8 ---
  :local rx3 0; :local tx3 0
  /interface monitor-traffic ether3 once do={ :set rx3 $"rx-bits-per-second"; :set tx3 $"tx-bits-per-second" }
  :local rx3m ($rx3 / 1000000); :local tx3m ($tx3 / 1000000)
  :local gw3Up [/ping 192.168.30.1 count=2 interval=100ms]
  :local p3 0; :local rtt3 0; :local st3 "0/30"; :local res3 "false"
  :if ($gw3Up > 0) do={
    :set p3 [/ping 8.8.8.8 count=30 interval=100ms]
    :if ($p3 > 0) do={
      /tool flood-ping 8.8.8.8 count=5 do={ :if ($sent = 5) do={ :set rtt3 $"avg-rtt" } }
      :set res3 "true"
    }
    :set st3 ($p3 . "/30")
  } else={
    :set rx3m 0; :set tx3m 0
  }

  # Envío de estado de WANs a Supabase
  :local data ("[" . \
    "{\"id\":\"wan1\",\"nombre\":\"WAN 1: Movistar 500M\",\"interfaz\":\"ether1\",\"gateway\":\"192.168.10.1\",\"estado\":\"" . $st1 . "\",\"latencia_ms\":" . $rtt1 . ",\"rx_mbps\":" . $rx1m . ",\"tx_mbps\":" . $tx1m . ",\"resolviendo\":" . $res1 . "}," . \
    "{\"id\":\"wan2\",\"nombre\":\"WAN 2: Movistar 500M\",\"interfaz\":\"ether2\",\"gateway\":\"192.168.20.1\",\"estado\":\"" . $st2 . "\",\"latencia_ms\":" . $rtt2 . ",\"rx_mbps\":" . $rx2m . ",\"tx_mbps\":" . $tx2m . ",\"resolviendo\":" . $res2 . "}," . \
    "{\"id\":\"wan3\",\"nombre\":\"WAN 3: Movistar 500M\",\"interfaz\":\"ether3\",\"gateway\":\"192.168.30.1\",\"estado\":\"" . $st3 . "\",\"latencia_ms\":" . $rtt3 . ",\"rx_mbps\":" . $rx3m . ",\"tx_mbps\":" . $tx3m . ",\"resolviendo\":" . $res3 . "}" . \
  "]")
  /tool fetch url=$supUrl mode=https http-method=post http-header-field=$headers http-data=$data check-certificate=no keep-result=no

  # ==========================================
  # 2. SALUD Y RENDIMIENTO DEL HARDWARE (hEX)
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
    :local pcName ("PC-" . $pcStr)
    :local isUp "false"
    :local act "apagada"
    :local wan "idle"
    :local rxKb 0
    :local txKb 0

    # 1. Detección física en LAN (ARP)
    :if ([:len [/ip arp find address=$curIp interface=bridge_LAN]] > 0) do={
      :set isUp "true"
    }

    # 2. Detección de WANs y actividad según reglas Mangle V5
    :if ($isUp = "true") do={
      :local gameConn [:len [/ip firewall connection find src-address~("^" . $curIp . ":") connection-mark="conn_WAN3"]]
      :local webConn [:len [/ip firewall connection find src-address~("^" . $curIp . ":") connection-mark~"conn_WAN[12]"]]

      :if ($gameConn > 0 and $webConn > 0) do={
        :set act "dual"
        :set wan "wan_dual"
      } else={
        :if ($gameConn > 0) do={
          :set act "gaming"
          :set wan "wan3_gaming"
        } else={
          :if ($webConn > 0) do={
            :set act "navegacion"
            :if (($pcNum % 2) = 0) do={ :set wan "wan1_nav" } else={ :set wan "wan2_nav" }
          } else={
            :set act "libre"
            :if (($pcNum % 2) = 0) do={ :set wan "wan1_nav" } else={ :set wan "wan2_nav" }
          }
        }
      }

      # 3. Lectura de consumo en KB/s de colas simples (si existen)
      :do {
        :local qId [/queue simple find name=$pcName]
        :if ([:len $qId] > 0) do={
          :local qRate [/queue simple get $qId rate]
          :local sPos [:find $qRate "/"]
          :if ($sPos > 0) do={
            :local tBps [:tonum [:pick $qRate 0 $sPos]]
            :local rBps [:tonum [:pick $qRate ($sPos + 1) [:len $qRate]]]
            :set txKb ($tBps / 1000)
            :set rxKb ($rBps / 1000)
          }
        }
      } on-error={}
    }

    :if ($f1 = false) do={ :set b1 ($b1 . ",") }
    :set b1 ($b1 . "{\"ip\":\"" . $curIp . "\",\"pc_name\":\"PC-" . $pcStr . "\",\"pc_number\":" . $pcNum . ",\"online\":" . $isUp . ",\"wan_active\":\"" . $wan . "\",\"actividad\":\"" . $act . "\",\"rx_kbps\":" . $rxKb . ",\"tx_kbps\":" . $txKb . "}")
    :set f1 false
  }
  :set b1 ($b1 . "]")
  /tool fetch url=$clientsUrl mode=https http-method=post http-header-field=$headers http-data=$b1 check-certificate=no keep-result=no

  # ==========================================
  # 4. ESCANEO 40 PCS: BLOQUE 2 (PC-21 a PC-40)
  # ==========================================
  :local b2 "["
  :local f2 true
  :for i from=121 to=140 do={
    :local curIp ("192.168.1." . $i)
    :local pcNum ($i - 100)
    :local pcStr $pcNum
    :if ($pcNum < 10) do={ :set pcStr ("0" . $pcNum) }
    :local pcName ("PC-" . $pcStr)
    :local isUp "false"
    :local act "apagada"
    :local wan "idle"
    :local rxKb 0
    :local txKb 0

    # 1. Detección física en LAN (ARP)
    :if ([:len [/ip arp find address=$curIp interface=bridge_LAN]] > 0) do={
      :set isUp "true"
    }

    # 2. Detección de WANs y actividad según reglas Mangle V5
    :if ($isUp = "true") do={
      :local gameConn [:len [/ip firewall connection find src-address~("^" . $curIp . ":") connection-mark="conn_WAN3"]]
      :local webConn [:len [/ip firewall connection find src-address~("^" . $curIp . ":") connection-mark~"conn_WAN[12]"]]

      :if ($gameConn > 0 and $webConn > 0) do={
        :set act "dual"
        :set wan "wan_dual"
      } else={
        :if ($gameConn > 0) do={
          :set act "gaming"
          :set wan "wan3_gaming"
        } else={
          :if ($webConn > 0) do={
            :set act "navegacion"
            :if (($pcNum % 2) = 0) do={ :set wan "wan1_nav" } else={ :set wan "wan2_nav" }
          } else={
            :set act "libre"
            :if (($pcNum % 2) = 0) do={ :set wan "wan1_nav" } else={ :set wan "wan2_nav" }
          }
        }
      }

      # 3. Lectura de consumo en KB/s de colas simples (si existen)
      :do {
        :local qId [/queue simple find name=$pcName]
        :if ([:len $qId] > 0) do={
          :local qRate [/queue simple get $qId rate]
          :local sPos [:find $qRate "/"]
          :if ($sPos > 0) do={
            :local tBps [:tonum [:pick $qRate 0 $sPos]]
            :local rBps [:tonum [:pick $qRate ($sPos + 1) [:len $qRate]]]
            :set txKb ($tBps / 1000)
            :set rxKb ($rBps / 1000)
          }
        }
      } on-error={}
    }

    :if ($f2 = false) do={ :set b2 ($b2 . ",") }
    :set b2 ($b2 . "{\"ip\":\"" . $curIp . "\",\"pc_name\":\"PC-" . $pcStr . "\",\"pc_number\":" . $pcNum . ",\"online\":" . $isUp . ",\"wan_active\":\"" . $wan . "\",\"actividad\":\"" . $act . "\",\"rx_kbps\":" . $rxKb . ",\"tx_kbps\":" . $txKb . "}")
    :set f2 false
  }
  :set b2 ($b2 . "]")
  /tool fetch url=$clientsUrl mode=https http-method=post http-header-field=$headers http-data=$b2 check-certificate=no keep-result=no

  :log info "NOC Telemetria V5 enviada OK: WANs, Salud y 40 PCs"
} on-error={
  :log warning "Error enviando telemetria completa V5 a Supabase"
}
