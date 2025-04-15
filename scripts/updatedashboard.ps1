# Define Output Paths
$OutputPath = "C:\inetpub\wwwroot\exchange_dashboard"
$MessageTrackingFile = "$OutputPath\MessageTracking.json"
$QueueStatsFile = "$OutputPath\QueueStats.json"
$QueueMessagesFile = "$OutputPath\QueueMessages.json"
$ErrorLogsFile = "$OutputPath\ErrorLogs.json"
$ReceiveLogPath = "C:\Program Files\Microsoft\Exchange Server\V15\TransportRoles\Logs\Hub\ProtocolLog\SmtpReceive"
$SendLogPath = "C:\Program Files\Microsoft\Exchange Server\V15\TransportRoles\Logs\Hub\ProtocolLog\SmtpSend"
$FEReceiveLogPath = "C:\Program Files\Microsoft\Exchange Server\V15\TransportRoles\Logs\FrontEnd\ProtocolLog\SmtpReceive"
$FESendLogPath = "C:\Program Files\Microsoft\Exchange Server\V15\TransportRoles\Logs\FrontEnd\ProtocolLog\SmtpSend"
$HoursBack = 12
$Cutoff = (Get-Date).AddHours(-$HoursBack)

# Check if Exchange module is available and import it
if ($null -eq (Get-Module -Name ExchangePowerShell -ListAvailable)) {
    Write-Host "Importing Exchange session..."
    $ExchangeServer = "exch19.msogb.local"  
    
$Session = New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri "http://$ExchangeServer/PowerShell/" -Authentication Kerberos

    #$Session = New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri http://localhost/PowerShell/ -Authentication Kerberos
    Import-PSSession $Session -DisableNameChecking -AllowClobber
}

# Ensure Output Directory Exists
if (!(Test-Path -Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath
}

# Get Exchange Service Status
$exchangeServices = Get-Service MSExchange* | ForEach-Object {
    $statusText = switch ($_.Status) {
        "Running"      { "Running" }
        "Stopped"      { "Stopped" }
        "Paused"       { "Paused" }
        "StartPending" { "Start Pending" }
        "StopPending"  { "Stop Pending" }
        Default        { "Unknown" }
    }

    $cssClass = switch ($_.Status) {
        "Running"      { "success" }
        "Stopped"      { "danger" }
        "Paused"       { "warning" }
        "StartPending" { "info" }
        "StopPending"  { "info" }
        Default        { "secondary" }
    }

    [PSCustomObject]@{
        Name = $_.Name
        Status = $statusText  # Use text instead of numbers
        CssClass = $cssClass
    }
} | ConvertTo-Json -Depth 2


$exchangeServices | Out-File "$outputPath/ExchangeServices.json" -Encoding utf8


#  Get Mail Flow Stats (Emails Sent/Received in Last Hour)
$mailStats = @{
    SentLastHour = (Get-MessageTrackingLog -ResultSize Unlimited -Start (Get-Date).AddHours(-1) -EventId SEND).Count
    ReceivedLastHour = (Get-MessageTrackingLog -ResultSize Unlimited -Start (Get-Date).AddHours(-1) -EventId RECEIVE).Count
} | ConvertTo-Json -Depth 2
$mailStats | Out-File "$outputPath/MailStats.json" -Encoding utf8


# Get Message Tracking Logs (Sort by Newest First)
$MessageTracking = Get-MessageTrackingLog -Start (Get-Date).AddDays(-2) -ResultSize Unlimited |
    Sort-Object Timestamp -Descending |
    Select-Object -First 1000 @{
        Name = 'Timestamp'
        Expression = { $_.Timestamp.ToUniversalTime().ToString("o") }
    },
    EventId, Source, Sender, Recipients, MessageSubject, MessageId

$MessageTracking | ConvertTo-Json -Depth 3 | Set-Content -Path $MessageTrackingFile -Encoding utf8


# Get Queue Stats
$QueueStats = Get-Queue | 
    Select-Object Identity, DeliveryType, Status, MessageCount, LastError | 
    ConvertTo-Json -Depth 3
$QueueStats | Out-File $QueueStatsFile

# Get Messages in Queues (Iterating Through Queues)
$QueueMessages = @()
$Queues = Get-Queue
foreach ($Queue in $Queues) {
    $Messages = Get-Message -Queue $Queue.Identity | 
        Select-Object Identity, Queue, FromAddress, 
            @{Name="Recipients";Expression={($_.Recipients -join "; ") -replace "(.{30}).+", '$1...'}},
            Subject, Size, Status, LastError
    $QueueMessages += $Messages
}
$QueueMessages | ConvertTo-Json -Depth 3 | Out-File $QueueMessagesFile


$AllEntries = @()

# Read all files modified in last 24 hours
Get-ChildItem -Path $ReceiveLogPath, $SendLogPath, $FEReceiveLogPath, $FESendLogPath -Filter *.log -Recurse | 
    Where-Object { $_.LastWriteTime -gt $Cutoff } | 
    ForEach-Object {
    $logType = if ($_.FullName -like "*SmtpSend*") { "Send" } else { "Receive" }

    Import-Csv $_.FullName -Header "Timestamp","Connector","SessionId","SequenceNumber","LocalEndpoint","RemoteEndpoint","Direction","Data" |
    Where-Object { ($_."Timestamp" -as [datetime]) -gt $Cutoff } |
    ForEach-Object {
        $_ | Add-Member -MemberType NoteProperty -Name Source -Value (Split-Path $_.PSPath -Parent -Leaf)
        $_ | Add-Member -MemberType NoteProperty -Name DirectionType -Value $logType
        $AllEntries += $_
    }
}

$Grouped = $AllEntries | Group-Object SessionId

$Sessions = $Grouped | ForEach-Object {
    $session = $_.Group | Sort-Object SequenceNumber

    [PSCustomObject]@{
        SessionId = $_.Name
        StartTime = $session[0].Timestamp
        EndTime = $session[-1].Timestamp
        DirectionType = $session[0].DirectionType
        From = ($session | Where-Object { $_.Data -like "MAIL FROM:*" }).Data
        To = ($session | Where-Object { $_.Data -like "RCPT TO:*" }).Data
        MessageId = ($session | Where-Object { $_.Data -like "*InternetMessageId*" }).Data
        Log = $session
    }
}

# Now sort those sessions by StartTime and add a counter
$SortedSessions = $Sessions | Sort-Object StartTime
$Counter = 0
$FinalSessions = $SortedSessions | ForEach-Object {
  	$_ | Add-Member -MemberType NoteProperty -Name SortOrder -Value $Counter
	$Counter++
    $_
}

$FinalSessions | ConvertTo-Json -Depth 5 | Out-File "$OutputPath\SmtpSessions.json" -Encoding utf8


# Get Exchange Errors
$ErrorLogs = Get-EventLog -LogName Application -Source MSExchange* -EntryType Error,Warning -Newest 250 |
    Select-Object TimeGenerated, EntryType, Source, InstanceID, Message |
    ConvertTo-Json -Depth 3
$ErrorLogs | Out-File $ErrorLogsFile

# Get Mail Stats (Recent Only)
$SentCount = (Get-MessageTrackingLog -EventId SEND -Start (Get-Date).AddMinutes(-2)).Count
$ReceivedCount = (Get-MessageTrackingLog -EventId RECEIVE -Start (Get-Date).AddMinutes(-2)).Count
$MailStats = @{
    SentLast2Min = $SentCount
    ReceivedLast2Min = $ReceivedCount
}
$MailStats | ConvertTo-Json -Depth 3 | Out-File "$OutputPath\MailStats2.json"

# Get Queue Stats
$TotalQueued = (Get-Queue | Measure-Object).Count
$RetryCount = (Get-Queue | Where-Object { $_.Status -eq "Retry" } | Measure-Object).Count
$FailedCount = (Get-Queue | Where-Object { $_.Status -eq "Failed" } | Measure-Object).Count
$QueueStats = @{
    TotalQueued = $TotalQueued
    Retry = $RetryCount
    Failed = $FailedCount
}
$QueueStats | ConvertTo-Json -Depth 3 | Out-File "$OutputPath\QueueStats2.json"

# Get Exchange Services Status
$ServiceStatus = Get-Service | Where-Object { $_.Name -like "MSExchange*" } | 
    Select-Object Name, Status | ConvertTo-Json -Depth 3
$ServiceStatus | Out-File "$OutputPath\ServiceStatus.json"

Write-Host "Dashboard updated."

Write-Host "JSON files created in $OutputPath"

