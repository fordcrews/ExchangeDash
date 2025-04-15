
### Exchange Managment Dashboard.

## Exchange Dashboard Installation Guide

This Exchange Dashboard is a comprehensive monitoring solution for your Exchange server that combines HTML, JavaScript, and PowerShell scripts. It provides real‑time stats on Exchange services, mail flow, message tracking, queue status, and error logs. Follow these steps to install and configure the dashboard:
1. Prepare the IIS Virtual Directory

    Create a Virtual Directory:
    In IIS Manager, create a new virtual directory (for example, “exdash”) under your desired website (typically under the Default Web Site).
    Configure Authentication:
        Set the virtual directory to use Windows Authentication only.
        Restrict access to only those users or groups that you want to allow to view the dashboard.
    Set Folder Permissions:
    Ensure that the account(s) running the scheduled tasks and accessing the dashboard have proper read/write permissions on the virtual directory folder (typically located under C:\inetpub\wwwroot\exdash).

2. Initialize the SQLite Database

    Download SQLite.NET:
        Download the SQLite.NET library (System.Data.SQLite) from the official site or a trusted repository.
        Extract the downloaded package and place the SQLite DLL (e.g. System.Data.SQLite.dll) in a known folder (for example, C:\Program Files\SQLite\).

    Run the Create Database Script:
    Open PowerShell with administrator privileges and execute the createdb.ps1 script. This script creates the initial SQLite database (e.g. exchange_stats.db) and initializes the necessary tables for storing mail stats, queue stats, and error logs.

3. Configure Scheduled Tasks

Set up two scheduled tasks using Windows Task Scheduler:

    Exchange Stats Collection (Every 2 Minutes):
    Create a task that runs a PowerShell script (for example, updatedashboard.ps1) every 2 minutes. This script collects stats from Exchange (e.g., service status, message tracking logs, queue stats) and writes them as JSON files in the virtual directory.

    Record Stats for Charts (Every 5 Minutes):
    Create another task to run the record_stats.ps1 script every 5 minutes. This script connects to the SQLite database and updates it with data for historical charting.

4. Deploy the Dashboard Files

    HTML/JavaScript Files:
    Copy the provided HTML (e.g., index.html), JavaScript (e.g., exchdb.js), and any related CSS files into your virtual directory (e.g., C:\inetpub\wwwroot\exdash).

    Test the Dashboard:
    Open your browser and navigate to the virtual directory URL (e.g., http://yourserver/exdash/). You should see the dashboard’s interface. Use the provided Quick Links and charts to verify that data is loading as expected.

5. Final Testing and Troubleshooting

    Verify Permissions and Authentication:
    Ensure that only the intended users can access the dashboard by testing with different accounts.
    Check Scheduled Task Logs:
    Confirm that the 2‑minute and 5‑minute tasks are running without errors by reviewing the Task Scheduler history and checking the JSON files in the virtual directory.
    Monitor the SQLite Database:
    Confirm that the database (exchange_stats.db) is being updated correctly by opening it with a SQLite viewer or using SQLite command‑line tools.


## Powershell script that runs ever 2 minutes that collects stats, logs, and queues and saves them as json files.

```powershell 
# updatedahsboard.ps1
# Define Output Paths
$OutputPath = "C:\inetpub\wwwroot\exchange_dashboard"
$MessageTrackingFile = "$OutputPath\MessageTracking.json"
$QueueStatsFile = "$OutputPath\QueueStats.json"
$QueueMessagesFile = "$OutputPath\QueueMessages.json"
$ErrorLogsFile = "$OutputPath\ErrorLogs.json"

# Check if Exchange module is available and import it
if ($null -eq (Get-Module -Name ExchangePowerShell -ListAvailable)) {
    Write-Host "Importing Exchange session..."
    $ExchangeServer = "exch16.msogb.local"  # Update with your actual Exchange server
    
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
$MessageTracking = Get-MessageTrackingLog -Start (Get-Date).AddHours(-4) |
    Sort-Object Timestamp -Descending |
    Select-Object -First 500 Timestamp, EventId, Source, Sender, Recipients, MessageSubject |
    ConvertTo-Json -Depth 3
$MessageTracking | Out-File $MessageTrackingFile

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

```

## Create Database powershell script.
This script is run once to create/initialize the database.

```powershell   
# createdb.ps1
$DBPath = "C:\inetpub\wwwroot\exchange_dashboard\exchange_stats.db"

$Connection = New-Object System.Data.SQLite.SQLiteConnection
$Connection.ConnectionString = "Data Source=$DBPath;Version=3;"
$Connection.Open()

$Command = $Connection.CreateCommand()

$Command.CommandText = @"
CREATE TABLE IF NOT EXISTS mail_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    sent INTEGER NOT NULL,
    received INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS queue_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    totalQueued INTEGER NOT NULL,
    retry INTEGER NOT NULL,
    failed INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    error_count INTEGER NOT NULL
);
"@
$Command.ExecuteNonQuery()
$Connection.Close()
```
## Record Stats
This powershell script is called once ever 5 minutes to update sqlite database with data for charts.

```powershell 
#record_stats.ps1
# Check if Exchange module is available and import it
if ($null -eq (Get-Module -Name ExchangePowerShell -ListAvailable)) {
    Write-Host "Importing Exchange session..."
    $ExchangeServer = "exch16.msogb.local"  # Update with your actual Exchange server
    
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
```
## Index.html 
This is the main page users sees.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
	<meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">

    <title>Exchange Dashboard</title>
    
    <!-- Bootstrap & DataTables CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.datatables.net/1.13.4/css/jquery.dataTables.min.css" rel="stylesheet">

    <!-- jQuery & DataTables JS -->
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdn.datatables.net/1.13.4/js/jquery.dataTables.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@1.3.0"></script>
<script src="https://code.highcharts.com/highcharts.js"></script>
<script src="https://code.highcharts.com/modules/heatmap.js"></script>
<script src="https://code.highcharts.com/modules/exporting.js"></script>


	<!-- DataTables Buttons CSS -->
<link rel="stylesheet" href="https://cdn.datatables.net/buttons/2.3.6/css/buttons.dataTables.min.css">

<!-- DataTables Buttons JS -->
<script src="https://cdn.datatables.net/buttons/2.3.6/js/dataTables.buttons.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js"></script>
<script src="https://cdn.datatables.net/buttons/2.3.6/js/buttons.html5.min.js"></script>
<script src="https://cdn.datatables.net/buttons/2.3.6/js/buttons.print.min.js"></script>


<style>
#exchangeStatusTable1, #exchangeStatusTable2 {
    font-size: 0.65rem;  /* Reduce font size */
}
#exchangeStatusTable1, #exchangeStatusTable2 th, #exchangeStatusTable td {
    padding: 3px;  /* Reduce padding */
}
.dt-buttons .btn {
    padding: 4px 8px;
    font-size: 0.85rem;
    margin-right: 5px;
}
.dt-buttons .btn-primary { background-color: #007bff; color: white; }
.dt-buttons .btn-success { background-color: #28a745; color: white; }
.dt-buttons .btn-danger { background-color: #dc3545; color: white; }
.dt-buttons .btn-secondary { background-color: #6c757d; color: white; }
#mailFlowChart, #queueStatusChart {
    width: 100%;
    height: 300px !important; /* Adjust height as needed */
}

.fullscreen-chart {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 20px; /* adjust as needed */
  z-index: 1050;
  background-color: #fff;
  overflow: auto;
}

.fullscreen-chart .card-body {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.fullscreen-chart canvas {
    width: 100% !important;
    height: 100% !important;
    display: block;
}



</style>
    
</head>
<body>

<div class="container my-4">
    <h2 class="text-center text-success">Exchange Dashboard</h2>

    <!-- Nav Tabs -->
    <ul class="nav nav-tabs" id="exchangeTabs">
		<li class="nav-item">
			<a class="nav-link" data-bs-toggle="tab" href="#exchangeStatus">Exchange Status</a>
		</li>
        <li class="nav-item">
            <a class="nav-link" data-bs-toggle="tab" href="#messageTracking">Message Tracking</a>
        </li>
        <li class="nav-item">
            <a class="nav-link" data-bs-toggle="tab" href="#queueStats">Queue Status</a>
        </li>
        <li class="nav-item">
            <a class="nav-link" data-bs-toggle="tab" href="#errorLogs">Error Logs</a>
        </li>
		<li class="nav-item">
			<a class="nav-link" data-bs-toggle="tab" href="#uptimeKuma">MSOGB Status</a>
		</li>
		<li class="nav-item">
			<a class="nav-link" data-bs-toggle="tab" href="#quickLinks">Quick Links</a>
		</li>
    </ul>

    <!-- Tab Content -->
    <div class="tab-content mt-3"> 
	
	  <!-- Exchange Services & Mail Stats -->
<div class="tab-pane fade show" id="exchangeStatus">
  <div class="container">
    <div class="row">
      
      <!-- Mail Flow Statistics Card -->
      <div class="col-md-6 col-lg-4 mb-4">
        <div class="card">
          <div class="card-header text-success">
            <h5 class="mb-0">Mail Flow Statistics</h5>
          </div>
          <div class="card-body">
            <table id="mailStatsTable" class="table table-striped">
              <thead>
                <tr><th>Metric</th><th>Value</th></tr>
              </thead>
              <tbody>
                <tr><td>Sent in Last Hour</td><td id="sentCount">Loading...</td></tr>
                <tr><td>Received in Last Hour</td><td id="receivedCount">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
	  
<!-- Mail Queue Summary Card -->
<div class="col-md-6 col-lg-4 mb-4">
    <div class="card">
        <div class="card-header text-primary">
            <h5 class="mb-0">Mail Queue Summary</h5>
        </div>
        <div class="card-body">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Count</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Total Queued</td><td id="queueTotal">0</td></tr>
                    <tr><td class="text-warning">Retrying</td><td id="queueRetry">0</td></tr>
                    <tr><td class="text-danger">Failed</td><td id="queueFailed">0</td></tr>
                    <tr><td class="text-info">Other Status</td><td id="queueOther">0</td></tr>
                </tbody>
            </table>
        </div>
    </div>
</div>

<!-- Mail Flow Trends -->
<div class="col-md-6 col-lg-6 mb-4">
    <div class="card chart-card" id="mailChartCard">
        <div class="card-header text-primary d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Mail Flow Trends</h5>
            <button class="expandChartBtn btn btn-sm btn-outline-secondary" data-chart="mailChartCard">
                <i class="fas fa-expand"></i>
            </button>
        </div>
        <div class="card-body">
            <canvas id="mailFlowChart"></canvas>
        </div>
    </div>
</div>


<!-- Queue Status Trends -->
<div class="col-md-6 col-lg-6 mb-4">
    <div class="card chart-card" id="queueChartCard">
        <div class="card-header text-warning d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Queue Status Trends</h5>
            <button class="expandChartBtn btn btn-sm btn-outline-secondary" data-chart="queueChartCard">
                <i class="fas fa-expand"></i>
            </button>
        </div>
        <div class="card-body">
            <canvas id="queueStatusChart"></canvas>
        </div>
    </div>
</div>





      <!-- Exchange Server Status Card (Fixed) -->
<div class="col-md-12 mb-3">
    <div class="card">
        <div class="card-header text-success">
            <h5 class="mb-0">Exchange Server Status</h5>
        </div>
        <div class="card-body">
            <div class="row">
                <!-- First Table (Left Side) -->
                <div class="col-md-6">
                    <div class="table-responsive">
                        <table id="exchangeStatusTable1" class="table table-striped">
                            <thead>
                                <tr><th>Service</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>

                <!-- Second Table (Right Side) -->
                <div class="col-md-6">
                    <div class="table-responsive">
                        <table id="exchangeStatusTable2" class="table table-striped">
                            <thead>
                                <tr><th>Service</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        <div id="exchangeServiceStatusFooter" class="card-footer text-center">
            <button id="restartAllServices" class="btn btn-sm btn-danger">Restart All Exchange Services</button>
            <button id="restartIIS" class="btn btn-sm btn-warning">Restart IIS</button>
        </div>
    </div>
</div>

  
</div>

</div>
</div>
        
        <!-- Message Tracking -->
        <div class="tab-pane fade show active" id="messageTracking">


            <table id="messageTrackingTable" class="table table-striped" >		
                <thead>
                    <tr>                
						<th class="json-date" style="width: 15%;">Timestamp</th>
						<th style="width: 10%;">EventId</th>
						<th style="width: 10%;">Source</th>
						<th style="width: 15%;">Sender</th>
						<th style="width: 20%; word-wrap: break-word;">Recipients</th>
						<th style="width: 30%;">MessageSubject</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

        <!-- Queue Stats -->
        <div class="tab-pane fade" id="queueStats">
            <table id="queueStatsTable" class="table table-striped">
                <thead>
                    <tr>
                        <th>Identity</th>
                        <th>Delivery Type</th>
                        <th>Status</th>
                        <th>Message Count</th>
                        <th>Last Error</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
			<table id="queueMessagesTable" class="table table-striped table-primary">
                <thead>
                    <tr>
                        <th>Identity</th>
						<th>Queue</th>
                        <th>FromAddress</th>
						<th>Recipients</th>
						<th>Subject</th>
                        <th>Size</th>
                        <th>Status</th>
                        <th>Last Error</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

        <!-- Error Logs -->
        <div class="tab-pane fade" id="errorLogs">
            <table id="errorLogsTable" class="table table-striped">
                <thead>
                    <tr>
                        <th class="json-date">Time Generated</th>
                        <th>Entry Type</th>
                        <th>Source</th>
                        <th>Instance ID</th>
                        <th style="width: 50%;">Message</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

<!-- Simple container (Bootstrap 4 or 5) -->
<div class="tab-pane fade" id="uptimeKuma">
  
  <!-- External Section -->
  <div class="mb-5">
    <iframe 
      src="https://uptime.melodysphotos.com/status/status"
      style="display: block; width: 100%; height: 900px; border: none;"
      scrolling="no">
    </iframe>
  </div>
  
  <!-- Internal Section -->
  <div>
    <iframe
      src="https://uptime.melodysphotos.com/status/internal"
      style="display: block; width: 100%; height: 800px; border: none;"
      scrolling="no">
    </iframe>
  </div>
  
</div>
	


<div class="tab-pane fade" id="quickLinks">
    <h5>Quick Links</h5>
   <!-- Bootstrap Tabs Navigation -->
<ul class="nav nav-tabs" id="myTab" role="tablist">
  <li class="nav-item" role="presentation">
    <button class="nav-link active" id="exchange-tab" data-bs-toggle="tab" data-bs-target="#exchange" type="button" role="tab" aria-controls="exchange" aria-selected="true">
      Exchange
    </button>
  </li>
  <li class="nav-item" role="presentation">
    <button class="nav-link" id="network-tab" data-bs-toggle="tab" data-bs-target="#network" type="button" role="tab" aria-controls="network" aria-selected="false">
      Network Gear
    </button>
  </li>
  <li class="nav-item" role="presentation">
    <button class="nav-link" id="storage-tab" data-bs-toggle="tab" data-bs-target="#storage" type="button" role="tab" aria-controls="storage" aria-selected="false">
      Storage
    </button>
  </li>
  <li class="nav-item" role="presentation">
    <button class="nav-link" id="printer-tab" data-bs-toggle="tab" data-bs-target="#printer" type="button" role="tab" aria-controls="printer" aria-selected="false">
      Printer
    </button>
  </li>
  <li class="nav-item" role="presentation">
    <button class="nav-link" id="other-tab" data-bs-toggle="tab" data-bs-target="#other" type="button" role="tab" aria-controls="other" aria-selected="false">
      Other
    </button>
  </li>
</ul>

<!-- Tabs Content -->
<div class="tab-content" id="myTabContent">
  <!-- Exchange Tab -->
  <div class="tab-pane fade show active" id="exchange" role="tabpanel" aria-labelledby="exchange-tab">
    <ul class="list-group mt-3">
      <li class="list-group-item">
        <a href="https://mail.ogb.state.ms.us/ecp" target="_blank" class="btn btn-success btn-sm" rel="noopener noreferrer">
          Open Exchange ECP
        </a>
      </li>
      <li class="list-group-item">
        <a href="https://mail.ogb.state.ms.us/owa" target="_blank" class="btn btn-success btn-sm" rel="noopener noreferrer">
          Open Outlook Web Access
        </a>
      </li>
      <li class="list-group-item">
        <a href="https://testconnectivity.microsoft.com/tests/exchange" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          Open Microsoft Connectivity Tester
        </a>
      </li>
    </ul>
	  <p class="text-muted">To open this in Incognito Mode:</p>
      <ul>
        <li><strong>Chrome:</strong> Right-click the link &amp; choose "Open link in incognito window."</li>
        <li><strong>Firefox:</strong> Right-click the link &amp; choose "Open Link in New Private Window."</li>
        <li><strong>Edge:</strong> Right-click the link &amp; choose "Open in InPrivate Window."</li>
      </ul>
  </div>
  
  <!-- Network Gear Tab -->
  <div class="tab-pane fade" id="network" role="tabpanel" aria-labelledby="network-tab">
    <ul class="list-group mt-3">
      <li class="list-group-item">
        <a href="https://10.247.107.1:4434/" target="_blank" class="btn btn-success btn-sm" rel="noopener noreferrer">
          CheckPoint Firewall
        </a>
      </li>
      <li class="list-group-item">
        <a href="http://10.247.107.52" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          Netgear Switch GS324TP S350 Series 24-Port Gigabit Ethernet
        </a>
      </li>	  
	        <li class="list-group-item">
        <a href="http://10.247.107.53" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          NETGEAR 48-Port Gigabit PoE+
        </a>
      </li>	
    </ul>
  </div>
  
  <!-- Storage Tab -->
  <div class="tab-pane fade" id="storage" role="tabpanel" aria-labelledby="storage-tab">
    <ul class="list-group mt-3">
      <li class="list-group-item">
        <a href="https://10.247.107.150/" target="_blank" class="btn btn-success btn-sm" rel="noopener noreferrer">
          ME2024 SAN
        </a>
      </li>
      <li class="list-group-item">
        <a href="https://10.247.107.152/" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          EMC VNXe 3200 (old San)
        </a>
      </li>	  
      <li class="list-group-item">
        <a href="https://10.247.107.45:5001" target="_blank" class="btn btn-secondary btn-sm" rel="noopener noreferrer">
          Synology NAS
        </a>
      </li>
    </ul>
  </div>
  
  <!-- Printer Tab -->
  <div class="tab-pane fade" id="printer" role="tabpanel" aria-labelledby="printer-tab">
    <ul class="list-group mt-3">
      <li class="list-group-item">
        <a href="http://10.247.107.64:8000/" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          Production Printer
        </a>
      </li>
      <li class="list-group-item">
        <a href="http://10.247.107.85:8000/" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          Executive Printer
        </a>
      </li>
      <li class="list-group-item">
        <a href="http://10.247.107.47:8000/" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          Well Files Printer
        </a>
      </li>
      <li class="list-group-item">
        <a href="http://10.247.107.69:8000/" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          Accounting Printer
        </a>
      </li>
      <li class="list-group-item">
        <a href="http://10.247.107.86:8000/" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          Legal Printer
        </a>
      </li>
      <li class="list-group-item">
        <a href="http://10.247.107.60/general/status.html" target="_blank" class="btn btn-warning btn-sm" rel="noopener noreferrer">
          HL-L5200DW
        </a>
      </li>	  
      <li class="list-group-item">
        <a href="http://10.247.107.87/general/status.html" target="_blank" class="btn btn-warning btn-sm" rel="noopener noreferrer">
          HL-L5200DW
        </a>
      </li>
      <li class="list-group-item">
        <a href="http://10.247.107.130/general/status.html" target="_blank" class="btn btn-success btn-sm" rel="noopener noreferrer">
          HL-L8360CDW IT
        </a>
      </li>	  
	   <li class="list-group-item">
        <a href="http://10.247.107.62" target="_blank" class="btn btn-success btn-sm" rel="noopener noreferrer">
           	NeuraLaserColor II
        </a>
      </li>	
	  <li class="list-group-item">
        <a href="http://10.247.107.66" target="_blank" class="btn btn-secondary btn-sm" rel="noopener noreferrer">
           	Lexmark T630 Production
        </a>
      </li>	
    </ul>
	<ul>
        <li><strong>Username:</strong> Administrator <strong>Password:</strong> 7654321</li>
    </ul>
  </div>
  
  <!-- Other Tab -->
  <div class="tab-pane fade" id="other" role="tabpanel" aria-labelledby="other-tab">
    <div class="mt-3">
      <li class="list-group-item">
        <a href="http://10.247.106.10" target="_blank" class="btn btn-primary btn-sm" rel="noopener noreferrer">
          Security Cameras
        </a>

    </div>
  </div>
</div>

</div>		

    </div>
</div>

<!-- Bootstrap JS -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

<script src="exchdb.js"></script>


</body>
</html>
```

## exchdb.JS
This is the javascript that drives the main index.html

```javascript
function updateQueueSummary() {
    let totalQueued = 0;
    let retryCount = 0;
    let failedCount = 0;
    let otherCount = 0;

    $("#queueMessagesTable tbody tr").each(function() {
        let status = $(this).find("td:nth-child(7)").text().trim().toLowerCase();
        totalQueued++;

        if (status.includes("retry")) {
            retryCount++;
        } else if (status.includes("failed") || status.includes("deferred") || status.includes("error")) {
            failedCount++;
        } else {
            otherCount++;
        }
    });

    $("#queueTotal").text(totalQueued);
    $("#queueRetry").text(retryCount);
    $("#queueFailed").text(failedCount);
    $("#queueOther").text(otherCount);
}

function loadTableData(tableId, jsonFile, callback) {
    $.getJSON(jsonFile)
        .done(function (data) {
            console.log(`Loading data for ${tableId} from ${jsonFile}`, data); // Debugging
			if (!data || (Array.isArray(data) && data.length === 0)) {
					console.warn(`${jsonFile} is empty.`);
					return;
			}
            if (!Array.isArray(data)) {
                if (typeof data === 'object') {
                    data = [data]; // Convert single object to an array
                } else {
                    console.error(`Error: Data from ${jsonFile} is not an array or object!`, data);
                    return;
                }
            }

            let table = $(tableId).DataTable();
            table.clear();

            data.forEach(row => {
                let rowData = Object.values(row);
                table.row.add(rowData);
            });

            table.draw();

            if (callback) {
                callback();
            }
        })
        .fail(function (jqxhr, textStatus, error) {
            console.error(`Failed to load ${jsonFile}: ${textStatus}, ${error}`);
        });
}




function loadExchangeStatus() {
    $.getJSON("ExchangeServices.json", function(data) {
        let splitIndex = Math.ceil(data.length / 2);
        let table1 = $("#exchangeStatusTable1").DataTable();
        let table2 = $("#exchangeStatusTable2").DataTable();

        table1.clear();
        table2.clear();

        data.slice(0, splitIndex).forEach(service => {
            let statusLabel = `<span class="badge bg-${service.CssClass}">${service.Status}</span>`;
            table1.row.add([service.Name, statusLabel, `<button class="btn btn-sm btn-primary restart-service" data-service="${service.Name}">Restart</button>`]);
        });

        data.slice(splitIndex).forEach(service => {
            let statusLabel = `<span class="badge bg-${service.CssClass}">${service.Status}</span>`;
            table2.row.add([service.Name, statusLabel, `<button class="btn btn-sm btn-primary restart-service" data-service="${service.Name}">Restart</button>`]);
        });

        table1.draw();  // 🔹 Ensure the tables are redrawn
        table2.draw();
    }).fail(function(jqxhr, textStatus, error) {
        console.error(`Failed to load ExchangeServices.json: ${textStatus}, ${error}`);
    });
}


function loadMailStats() {
    $.getJSON("MailStats.json", function(data) {
        $("#sentCount").text(data.SentLastHour);
        $("#receivedCount").text(data.ReceivedLastHour);
    });
}



function loadQueueStatsChart() {
    $.getJSON("QueueStatsChart.json", function(data) {
        const labels = data.map(entry => {
            const date = new Date(entry.timestamp);
            const formattedTime = date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }); // 24-hour format HH:mm
            const formattedDate = date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }); // MM-DD format
            return `${formattedDate} ${formattedTime}`; // MM-DD HH:mm
        });

        const totalQueued = data.map(entry => entry.totalQueued);
        const retry = data.map(entry => entry.retry);
        const failed = data.map(entry => entry.failed);

        const ctx = document.getElementById("queueStatusChart").getContext("2d");

        if (window.queueChart) window.queueChart.destroy();

        window.queueChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    { label: "Total Queued", data: totalQueued, borderColor: "blue", backgroundColor: "rgba(0, 0, 255, 0.2)", fill: true },
                    { label: "Retry", data: retry, borderColor: "orange", backgroundColor: "rgba(255, 165, 0, 0.2)", fill: true },
                    { label: "Failed", data: failed, borderColor: "red", backgroundColor: "rgba(255, 0, 0, 0.2)", fill: true }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: "Time (MM-DD HH:mm)" },
                        ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 }
                    },
                    y: {
                        title: { display: true, text: "Count" }
                    }
                }
            }
        });
    });
}




function loadMailStatsChart() {
    $.getJSON("MailStatsChart.json", function(data) {
        const labels = data.map(entry => {
            const date = new Date(entry.timestamp);
            const formattedTime = date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }); // 24-hour format HH:mm
            const formattedDate = date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }); // MM-DD format
            return `${formattedDate} ${formattedTime}`; // MM-DD HH:mm
        });

        const sent = data.map(entry => entry.sent);
        const received = data.map(entry => entry.received);

        const ctx = document.getElementById("mailFlowChart").getContext("2d");

        if (window.mailChart) window.mailChart.destroy();

        window.mailChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    { label: "Sent Emails", data: sent, backgroundColor: "rgba(0, 255, 0, 0.6)" },
                    { label: "Received Emails", data: received, backgroundColor: "rgba(0, 0, 255, 0.6)" }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Allows chart to take more space
                scales: {
                    x: {
                        title: { display: true, text: "Time (MM-DD HH:mm)" },
                        stacked: true,
                        ticks: {
                            autoSkip: true, // Avoids label overcrowding
                            maxRotation: 45, // Slight rotation for readability
                            minRotation: 0
                        }
                    },
                    y: {
                        title: { display: true, text: "Count" },
                        stacked: true
                    }
                }
            }
        });
    });
}



// **Unified function to refresh all data**


function refreshAllData() {
    loadTableData("#messageTrackingTable", "MessageTracking.json", function() {
        $("#messageTrackingTable").DataTable().draw();
    });

    loadTableData("#queueStatsTable", "QueueStats.json", function() {
        $("#queueStatsTable").DataTable().draw();
    });

    loadTableData("#queueMessagesTable", "QueueMessages.json", function() {
        updateQueueSummary();
        $("#queueMessagesTable").DataTable().draw();
    });

    loadTableData("#errorLogsTable", "ErrorLogs.json", function() {
        $("#errorLogsTable").DataTable().draw();
    });

    loadExchangeStatus();
    loadMailStats();
    loadQueueStatsChart();
    loadMailStatsChart();
}


// **Initialize everything on page load**
$(document).ready(function() {
    // Initialize DataTables (Disable Sorting for Services)
    $("#messageTrackingTable").DataTable({ order: [[0, 'desc']],	// Adds buttons to DataTables
	        dom: '<"row"<"col-md-4"l><"col-md-4"B><"col-md-4"f>>' + // Row with Page Length (l), Buttons (B), and Search (f)
             '<"row"<"col-12"tr>>' + // Table (t)
             '<"row"<"col-md-5"i><"col-md-7"p>>', // Info (i) and Pagination (p)
            buttons: [
    {
        extend: 'csvHtml5',
        text: 'Export CSV',
        className: 'btn btn-sm btn-primary',
        customizeData: function (data) {
            formatExportedDates(data);
        }
    },
    {
        extend: 'excelHtml5',
        text: 'Export Excel',
        className: 'btn btn-sm btn-success',
        customizeData: function (data) {
            formatExportedDates(data);
        }
    },
    {
        extend: 'pdfHtml5',
        text: 'Export PDF',
        className: 'btn btn-sm btn-danger',
        customizeData: function (data) {
            formatExportedDates(data);
        }
    },
    {
        extend: 'print',
        text: 'Print',
        className: 'btn btn-sm btn-secondary',
        customizeData: function (data) {
            formatExportedDates(data);
        }
    }
],

            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]] // Restore page length options
        }); 
    $("#queueStatsTable, #queueMessagesTable").DataTable();
	$("#errorLogsTable").DataTable({ order: [[0, 'desc']],	// Adds buttons to DataTables
	        dom: '<"row"<"col-md-4"l><"col-md-4"B><"col-md-4"f>>' + // Row with Page Length (l), Buttons (B), and Search (f)
             '<"row"<"col-12"tr>>' + // Table (t)
             '<"row"<"col-md-5"i><"col-md-7"p>>', // Info (i) and Pagination (p)
            buttons: [
    {
        extend: 'csvHtml5',
        text: 'Export CSV',
        className: 'btn btn-sm btn-primary',
        customizeData: function (data) {
            formatExportedDates(data);
        }
    },
    {
        extend: 'excelHtml5',
        text: 'Export Excel',
        className: 'btn btn-sm btn-success',
        customizeData: function (data) {
            formatExportedDates(data);
        }
    },
    {
        extend: 'pdfHtml5',
        text: 'Export PDF',
        className: 'btn btn-sm btn-danger',
        customizeData: function (data) {
            formatExportedDates(data);
        }
    },
    {
        extend: 'print',
        text: 'Print',
        className: 'btn btn-sm btn-secondary',
        customizeData: function (data) {
            formatExportedDates(data);
        }
    }
],

            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "All"]] // Restore page length options
        });
    $("#exchangeStatusTable1, #exchangeStatusTable2").DataTable({ paging: false, searching: false, info: false, autoWidth: false, ordering: false });
    $("#mailStatsTable").DataTable({ paging: false, searching: false, info: false });
	
	


    // Load data initially
    refreshAllData();

    // Auto-refresh every 2 minutes
    setInterval(refreshAllData, 120000);
});

document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("#messageTrackingTable td:nth-child(5)").forEach(cell => {
        cell.innerHTML = cell.innerHTML.replace(/,/g, ",<wbr>"); // Add word-break opportunity after commas
    });
});


document.addEventListener("DOMContentLoaded", function() {
    fetch('/exdash/whoami.ashx')
        .then(response => response.json())
        .then(data => {
            console.log("Logged-in user:", data.username);

            var loggedInUser = data.username.toLowerCase();
            var adminUsers = ["msogb\\fcrews"]; // Replace with real IT group usernames

            if (!adminUsers.includes(loggedInUser)) {

                
                var messageTrackingTable = $('#messageTrackingTable').DataTable();
                var exchangeStatusTable1 = $('#exchangeStatusTable1').DataTable();
                var exchangeStatusTable2 = $('#exchangeStatusTable2').DataTable();

                // Hide the 6th column (index 5) in the message tracking table
                messageTrackingTable.column(5).visible(false);

                // Hide the 3rd column (index 2) in both exchange service status tables
                exchangeStatusTable1.column(2).visible(false);
                exchangeStatusTable2.column(2).visible(false);
                
                // Hide the exchange service status footer
                var footer = document.getElementById("exchangeServiceStatusFooter");
                if (footer) {
                    footer.style.display = "none";
                }
            }

            // Hide email subjects that don't match the logged-in sender
            document.querySelectorAll(".email-subject").forEach(element => {
                if (!element.dataset.sender.toLowerCase().includes(loggedInUser)) {
                    element.textContent = "[Hidden]";
                }
            });
        })
        .catch(error => console.error("Error fetching user info:", error));
});

function formatExportedDates(data) {
    data.body.forEach(row => {
        row.forEach((cell, i) => {
            if ($(`th:eq(${i})`).hasClass("json-date")) {  // Check if column has .json-date class
                row[i] = convertJsonDate(cell); // Convert JSON date
            }
        });
    });
}

// Function to Convert JSON Date
function convertJsonDate(jsonDate) {
    if (!jsonDate) return "";
    const match = jsonDate.match(/\d+/);
    if (!match) return jsonDate;
    const timestamp = parseInt(match[0]);
    return new Date(timestamp).toLocaleString();
}


// **Convert JSON Date Format**
function convertJsonDate(jsonDate) {
    if (!jsonDate) return "";
    const match = jsonDate.match(/\d+/);
    if (!match) return jsonDate;
    return new Date(parseInt(match[0])).toLocaleString();
}

// **Format Dates on Table Redraw**
$('#errorLogsTable, #messageTrackingTable').on('draw.dt', function() {
    $(this).find('tbody tr').each(function() {
        const $td = $(this).find('td:first');
        if (!$td.data('formatted')) {
            const originalText = $td.text().trim();
            const convertedDate = convertJsonDate(originalText);
            $td.data('formatted', true).data('original', originalText).text(convertedDate);
        }
    });
});



// **Restart Individual Exchange Service**
$(document).on("click", ".restart-service", function() {
    let serviceName = $(this).data("service");
    $.get(`restart-service.bat?service=${serviceName}`, function(response) {
        alert(`Restarted ${serviceName}`);
        loadExchangeStatus(); // Refresh table
    });
});

// **Restart All Exchange Services**
$("#restartAllServices").click(function() {
    if (confirm("Are you sure you want to restart all Exchange services?")) {
        $.get("restart-exchange.bat", function() {
            alert("Restarted all Exchange services.");
            loadExchangeStatus();
        });
    }
});

// **Restart IIS**
$("#restartIIS").click(function() {
    if (confirm("Are you sure you want to restart IIS?")) {
        $.get("restart-iis.bat", function() {
            alert("IIS restarted successfully.");
        });
    }
});


document.addEventListener("DOMContentLoaded", function () {
    const tabs = document.querySelectorAll("#exchangeTabs .nav-link");
    const storageKey = "activeNavTab";
    
    // Load the last active tab from local storage
    const lastActiveTab = localStorage.getItem(storageKey);
    if (lastActiveTab) {
        const activeTab = document.querySelector(`#exchangeTabs .nav-link[href='${lastActiveTab}']`);
        if (activeTab) {
            activeTab.classList.add("active");
            document.querySelector(lastActiveTab).classList.add("show", "active");
            tabs.forEach(tab => {
                if (tab !== activeTab) {
                    tab.classList.remove("active");
                    document.querySelector(tab.getAttribute("href")).classList.remove("show", "active");
                }
            });
        }
    }
    
    // Add event listeners to all tabs
    tabs.forEach(tab => {
        tab.addEventListener("click", function () {
            const targetTab = this.getAttribute("href");
            localStorage.setItem(storageKey, targetTab);
        });
    });
});


document.addEventListener("DOMContentLoaded", function() {
    const expandButtons = document.querySelectorAll(".expandChartBtn");

    expandButtons.forEach(button => {
        button.addEventListener("click", function() {
            const chartCard = document.getElementById(this.dataset.chart);
            const canvas = chartCard.querySelector("canvas");
            let isExpanded = chartCard.classList.contains("fullscreen-chart");

            if (!isExpanded) {
                // Expand Mode
                chartCard.classList.add("fullscreen-chart");
                this.innerHTML = '<i class="fas fa-compress"></i>';
            } else {
                // Normal Mode
                chartCard.classList.remove("fullscreen-chart");
                this.innerHTML = '<i class="fas fa-expand"></i>';
            }

            // Ensure Highcharts resizes properly
            setTimeout(() => {
                if (canvas.id === "queueStatusChart" && window.queueChart) {
                    let newWidth = chartCard.clientWidth;
                    let newHeight = chartCard.clientHeight;
                    console.log(`Resizing queueStatusChart to: ${newWidth}x${newHeight}`);
                    window.queueChart.setSize(newWidth, newHeight, false);
                }
                if (canvas.id === "mailFlowChart" && window.mailChart) {
                    let newWidth = chartCard.clientWidth;
                    let newHeight = chartCard.clientHeight;
                    console.log(`Resizing mailFlowChart to: ${newWidth}x${newHeight}`);
                    window.mailChart.setSize(newWidth, newHeight, false);
                }
            }, 300);
        });
    });
});


function resizeIframe(iframe) {
  try {
    // Attempt to resize iframe based on its document's scroll height
    iframe.style.height = iframe.contentWindow.document.documentElement.scrollHeight + "px";
  } catch (e) {
    console.warn("Auto-resizing iframe failed (likely due to cross-domain restrictions). Using fallback height.", e);
    // Set a fallback height if cross-domain access is not permitted
    iframe.style.height = "1200px";
  }
}
```

## whoami.ashx
This detectes who is currently logged in and returns it. 
```C 
<%@ WebHandler Language="C#" Class="WhoAmI" %>

using System;
using System.Web;

public class WhoAmI : IHttpHandler
{
    public void ProcessRequest(HttpContext context)
    {
        context.Response.ContentType = "application/json";
        context.Response.ContentEncoding = System.Text.Encoding.UTF8;  // Force UTF-8 Encoding

        string username = context.User.Identity.Name;
        context.Response.Write("{\"username\": \"" + HttpUtility.JavaScriptStringEncode(username) + "\"}");
    }

    public bool IsReusable { get { return false; } }
}
```

