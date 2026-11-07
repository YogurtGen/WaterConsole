!macro customInstall
  IfSilent wc_skip_firewall
  MessageBox MB_YESNO|MB_ICONQUESTION "Allow phones to connect on private networks? This adds a WaterConsole Core-only Windows Firewall rule for Private networks and the local subnet. Administrator approval is required. Choose No to configure it later." IDNO wc_skip_firewall
  ExecWait '"powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\configure-firewall.ps1" -ExecutablePath "$INSTDIR\WaterConsole Core.exe"'
  wc_skip_firewall:
!macroend

!macro customUnInstall
  IfSilent wc_skip_remove_firewall
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove the optional WaterConsole private-network firewall rule? Administrator approval is required." IDNO wc_skip_remove_firewall
  ExecWait '"powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$INSTDIR\resources\configure-firewall.ps1" -ExecutablePath "$INSTDIR\WaterConsole Core.exe" -Remove'
  wc_skip_remove_firewall:
!macroend
