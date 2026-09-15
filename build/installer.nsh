; Windows firewall rules for EtherTransfer (design spec §4.6).
;
; A direct Ethernet cable with no router shows up to Windows as an
; "Unidentified network", which gets the Public firewall profile - so the
; rule must cover Private AND Public, not just Private. It's restricted to
; the local subnet so it doesn't open the ports to the wider internet.

!macro customInstall
  DetailPrint "Adding firewall rules for EtherTransfer..."
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="EtherTransfer (TCP-In)" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" protocol=TCP localport=47800 profile=private,public remoteip=localsubnet enable=yes'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="EtherTransfer (UDP-In)" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" protocol=UDP localport=47801 profile=private,public remoteip=localsubnet enable=yes'
  Pop $0
!macroend

!macro customUnInstall
  DetailPrint "Removing firewall rules for EtherTransfer..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="EtherTransfer (TCP-In)"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="EtherTransfer (UDP-In)"'
  Pop $0
!macroend
