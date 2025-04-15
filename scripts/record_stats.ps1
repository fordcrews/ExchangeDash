# Check if Exchange module is available and import it
if ($null -eq (Get-Module -Name ExchangePowerShell -ListAvailable)) {
    Write-Host "Importing Exchange session..."
    $ExchangeServer = "exch19.msogb.local"  
    
$Session = New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri "http://$ExchangeServer/PowerShell/" -Authentication Kerberos

    #$Session = New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri http://localhost/PowerShell/ -Authentication Kerberos
    Import-PSSession $Session -DisableNameChecking -AllowClobber
}

# Load SQLite
[System.Reflection.Assembly]::LoadFile("C:\Program Files\SQLite\System.Data.SQLite.dll")

# SQLite Setup
$DBPath = "C:\inetpub\wwwroot\exchange_dashboard\exchange_stats.db"
$Connection = New-Object System.Data.SQLite.SQLiteConnection
$Connection.ConnectionString = "Data Source=$DBPath;Version=3;"
$Connection.Open()

# Fetch Data
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$SentCount = (Get-MessageTrackingLog -EventId SEND -Start (Get-Date).AddMinutes(-5)).Count
$ReceivedCount = (Get-MessageTrackingLog -EventId RECEIVE -Start (Get-Date).AddMinutes(-5)).Count
$TotalQueued = (Get-Queue | Measure-Object).Count
$RetryCount = (Get-Queue | Where-Object { $_.Status -eq "Retry" } | Measure-Object).Count
$FailedCount = (Get-Queue | Where-Object { $_.Status -eq "Failed" } | Measure-Object).Count

# Insert Data
$Cmd = $Connection.CreateCommand()
$Cmd.CommandText = "INSERT INTO mail_stats (timestamp, sent, received) VALUES ('$Timestamp', $SentCount, $ReceivedCount)"
$Cmd.ExecuteNonQuery()
$Cmd.CommandText = "INSERT INTO queue_stats (timestamp, totalQueued, retry, failed) VALUES ('$Timestamp', $TotalQueued, $RetryCount, $FailedCount)"
$Cmd.ExecuteNonQuery()

# Generate JSON for 24-hour Charts

# 🛠 Fix: Close DataReader before running another query
$Cmd.CommandText = "SELECT * FROM mail_stats ORDER BY timestamp DESC LIMIT 288;"
$MailStatsList = @()
$Reader = $Cmd.ExecuteReader()
while ($Reader.Read()) {
    $MailStatsList += @{
        timestamp = $Reader["timestamp"]
        sent = $Reader["sent"]
        received = $Reader["received"]
    }
}
$Reader.Close()  # CLOSE the DataReader before running the next query
$MailStatsList | ConvertTo-Json -Depth 3 | Out-File "C:\inetpub\wwwroot\exchange_dashboard\MailStatsChart.json"

# 🛠 Fix: Ensure DataReader is closed before next query
$Cmd.CommandText = "SELECT * FROM queue_stats ORDER BY timestamp DESC LIMIT 288;"
$QueueStatsList = @()
$Reader = $Cmd.ExecuteReader()
while ($Reader.Read()) {
    $QueueStatsList += @{
        timestamp = $Reader["timestamp"]
        totalQueued = $Reader["totalQueued"]
        retry = $Reader["retry"]
        failed = $Reader["failed"]
    }
}
$Reader.Close()  # CLOSE the DataReader after reading queue_stats
$QueueStatsList | ConvertTo-Json -Depth 3 | Out-File "C:\inetpub\wwwroot\exchange_dashboard\QueueStatsChart.json"

$Connection.Close()
Write-Host "5-minute data recorded & JSON updated."
