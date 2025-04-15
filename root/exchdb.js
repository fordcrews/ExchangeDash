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
  // Skip message tracking if user is inspecting it
  if (currentTab !== 'messageTracking' || !anyRowExpanded('#messageTrackingTable')) {
    fetch('MessageTracking.json')
      .then(res => res.json())
      .then(data => {
        if (!data.length) {
          console.warn("MessageTracking.json is empty");
          return;
        }
        renderTrackingTable(data);
      })
      .catch(err => {
        console.error("Could not load MessageTracking.json:", err);
      });
  } else {
    console.log("Skipping Message Tracking refresh — user is inspecting.");
  }

  // Skip SMTP if user is inspecting it
  if (currentTab !== 'smtp-tab' || !anyRowExpanded('#smtpTable')) {
    fetch('SmtpSessions.json')
      .then(res => res.json())
      .then(data => {
        renderSMTPTable(data);
      })
      .catch(err => console.error('Failed to load SMTP Sessions:', err));
  } else {
    console.log("Skipping SMTP refresh — user is inspecting.");
  }

  // Queue stats can always update
  loadTableData("#queueStatsTable", "QueueStats.json", function() {
    $("#queueStatsTable").DataTable().draw();
  });

  loadTableData("#queueMessagesTable", "QueueMessages.json", function() {
    updateQueueSummary();
    $("#queueMessagesTable").DataTable().draw();
  });

  // Only update error logs if we're not viewing them
  if (currentTab !== 'errorLogs') {
    loadTableData("#errorLogsTable", "ErrorLogs.json", function() {
      $("#errorLogsTable").DataTable().draw();
    });
  } else {
    console.log("Skipping Error Logs refresh — user is inspecting.");
  }

  // Always update these
  loadExchangeStatus();
  loadMailStats();
  loadQueueStatsChart();
  loadMailStatsChart();
}

function anyRowExpanded(tableSelector) {
  return $(`${tableSelector} tr.shown`).length > 0;
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


let currentTab = '';

$('a[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
  currentTab = $(e.target).attr('href').replace('#', ''); // e.g. 'smtp-tab'
  console.log("Switched to tab:", currentTab);
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
function formatTimestamp(input) {
    if (!input) return 'Invalid';
    const date = new Date(input);
    return isNaN(date) ? 'Invalid' : date.toLocaleString();
}


function formatRowDetails(messageGroup) {
    const eventMeta = {
        SEND:           { icon: '📤', desc: 'Message successfully sent via SMTP to its destination.' },
        DELIVER:        { icon: '📬', desc: 'Message delivered to the recipient’s mailbox.' },
        DROP:           { icon: '❌', desc: 'Message dropped — usually due to rules or rejection.' },
        TRANSFER:       { icon: '🔁', desc: 'Message handed off internally to another queue or server.' },
        FAIL:           { icon: '⚠️', desc: 'Message failed to deliver. May retry or generate NDR.' },
        SENDEXTERNAL:   { icon: '🌐', desc: 'Sent to an external domain.' },
        AGENTINFO:      { icon: '🧠', desc: 'A mail rule or agent modified or processed the message.' },
        DSN:            { icon: '👹', desc: 'Delivery status notification (e.g., bounce or NDR).' },
        RECEIVE:        { icon: '📥', desc: 'Message received by Exchange.' },
        SUBMIT:         { icon: '📨', desc: 'Message submitted to mailbox by user or app.' },
        SUBMITFAIL:     { icon: '🛑', desc: 'Submit failed — mailbox store issue.' },
        EXPAND:         { icon: '➕', desc: 'Distribution list expanded.' },
        DUPLICATEDELIVER: { icon: '👯', desc: 'Duplicate delivery was prevented.' }
    };

    const sortedGroup = [...messageGroup].sort((a, b) =>
        new Date(a.Timestamp) - new Date(b.Timestamp)
    );

    return `
    <div class="container-fluid">
        ${sortedGroup.map(entry => {
            const meta = eventMeta[entry.EventId] || {};
            return `
            <div class="row align-items-start mb-1" data-bs-toggle="tooltip" title="${meta.desc || ''}">
                <div class="col-auto text-center" style="min-width: 2em;">
                    ${meta.icon || ''}
                </div>
                <div class="col-md-3 fw-bold">
                    ${entry.EventId} from ${entry.Source}
                </div>
                <div class="col-md-3 text-muted">
                    ${formatTimestamp(entry.Timestamp)}
                </div>
                <div class="col-md-4">
                    ${entry.MessageSubject ? `<em>${entry.MessageSubject}</em>` : ''}
                </div>
            </div>`;
        }).join('')}
    </div>`;
}


function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

 


function renderTrackingTable(data) {
    const groupedData = {};

    data.forEach(entry => {
        const id = entry.MessageId || 'unknown';
        if (!groupedData[id]) groupedData[id] = [];
        groupedData[id].push(entry);
    });

    const tableRows = Object.entries(groupedData).map(([msgId, group]) => {
        const main = group.find(e => e.EventId === 'SEND') || group[0];

const date = new Date(main.Timestamp);
const Timestamp = date.getTime();
const TimestampDisplay = date.toLocaleString();
const hasFail = group.some(e => e.EventId === 'FAIL');
const timestamps = group.map(e => new Date(e.Timestamp)).filter(d => !isNaN(d.getTime()));
timestamps.sort((a, b) => a - b);
const durationMs = timestamps.length >= 2 ? (timestamps[timestamps.length - 1] - timestamps[0]) : 0;
const processTime = formatDuration(durationMs);

return {
    MessageId: msgId,
    Timestamp,
    TimestampDisplay,
    Sender: main.Sender,
    Recipients: main.Recipients.join(', '),
    Subject: main.MessageSubject,
    Group: group,
	ProcessingTime: processTime,
    rowClass: hasFail ? 'table-danger' : ''
};
    });

    if ($.fn.DataTable.isDataTable('#messageTrackingTable')) {
        $('#messageTrackingTable').DataTable().clear().destroy();
        $('#messageTrackingTable tbody').empty();
    }

    const table = $('#messageTrackingTable').DataTable({
        data: tableRows,
		 autoWidth: false,
       columns: [
        {
            title: 'Timestamp',
            data: 'Timestamp',
            render: function (data, type, row) {
                // Use raw ms timestamp for sorting, display formatted
                if (type === 'sort') return row.Timestamp;
                return data || 'Invalid';
            }
        },
        { title: 'Sender', data: 'Sender' },
        { title: 'Recipients', data: 'Recipients' },
        { title: 'Subject', data: 'Subject' },
		{ title: 'Process Time', data: 'ProcessingTime' },
        {
            className: 'dt-control',
            orderable: false,
            data: null,
            defaultContent: '',
            title: 'Details'
        }
    ],
    order: [[0, 'desc']],
    dom: '<"row mb-2"<"col-md-4"l><"col-md-4"B><"col-md-4"f>>' + 
         '<"row"<"col-12"tr>>' + 
         '<"row"<"col-md-5"i><"col-md-7"p>>',
    buttons: [
        { extend: 'copy', className: 'btn btn-sm btn-info' },
        { extend: 'csv', className: 'btn btn-sm btn-primary' },
        { extend: 'excel', className: 'btn btn-sm btn-success' },
        { extend: 'pdf', className: 'btn btn-sm btn-danger' },
        { extend: 'print', className: 'btn btn-sm btn-secondary' }
    ],
    rowCallback: function (row, data) {
        if (data.rowClass) {
            $(row).addClass(data.rowClass);
        }
    }
    });

$('#messageTrackingTable tbody').on('click', 'td.dt-control', function () {
    const tr = $(this).closest('tr');
    const row = table.row(tr);

    if (!row || !row.data()) return;

    // Collapse any other shown row
    $('#messageTrackingTable tbody tr.shown').each(function () {
        const otherRow = table.row(this);
        if (otherRow.child.isShown()) {
            otherRow.child.hide();
            $(this).removeClass('shown');
        }
    });

    // Toggle current row
    if (row.child.isShown()) {
        row.child.hide();
        tr.removeClass('shown');
    } else {
        const html = formatRowDetails(row.data().Group);
row.child(html).show();
tr.addClass('shown');

// Initialize tooltips in the newly added child row
setTimeout(() => {
  tr.next().find('[data-bs-toggle="tooltip"]').each(function () {
    new bootstrap.Tooltip(this);
  });
}, 10);

        tr.addClass('shown');
    }
});

}

// Usage:
// fetch('/path/to/message-tracking.json')
//   .then(res => res.json())
//   .then(data => renderTrackingTable(data));


function renderSMTPTable(data) {
    if ($.fn.DataTable.isDataTable('#smtpTable')) {
        $('#smtpTable').DataTable().clear().destroy();
        $('#smtpTable tbody').empty();
    }

    const validSessions = data.filter(session => {
        return session && session.StartTime && Array.isArray(session.Log);
    });

    console.log("Valid sessions count:", validSessions.length);

const tableData = validSessions.map((session, index) => {
  const log = session.Log || [];

  const fromLine = log.find(e => e.Data?.startsWith('MAIL FROM:'))?.Data || '';
  const toLine = log.find(e => e.Data?.startsWith('RCPT TO:'))?.Data || '';

  const from = fromLine.replace(/^MAIL FROM:/i, '').replace(/[<>]/g, '').trim();
  const to = toLine.replace(/^RCPT TO:/i, '').replace(/[<>]/g, '').trim();

  const clientIP = log.find(e => e.Data?.includes('Hello ['))?.Data?.match(/\[(.*?)\]/)?.[1];
  const fallbackFrom = clientIP || session.Log?.[0]?.RemoteEndpoint;

  const startDate = new Date(session.StartTime);
  const SortOrder = typeof session.SortOrder !== 'undefined' ? session.SortOrder : index;

  const logText = log.map(e => `${e.Direction} ${e.Data}`).join(' ');

  return {
    SortOrder,
    Start: startDate.toLocaleString(),
    From: from || fallbackFrom || '',
    To: to || '',
    Direction: session.DirectionType,
    MessageId: session.MessageId || '',
    Details: session,
    _raw: session,
    SearchText: logText  // 👈 searchable log content
  };
});


    console.log("Final SMTP tableData:", tableData);

const table = $('#smtpTable').DataTable({
  data: tableData,
  columns: [
    { data: 'SortOrder', visible: false },
    { data: 'Start' },
    { data: 'From' },
    { data: 'To' },
    { data: 'Direction' },
    { data: 'MessageId' },
    {
      data: null,
      className: 'dt-control text-center',
      orderable: false,
      defaultContent: '<button class="btn btn-sm btn-success expand-btn"><i class="fa fa-plus-circle"></i></button>'
    },
    { data: 'SearchText', visible: false } // 👈 hidden but searchable
  ],
  order: [[0, 'desc']],
});


    // Row expansion
    $('#smtpTable tbody').off('click').on('click', 'td .expand-btn', function () {
        const tr = $(this).closest('tr');
        const row = table.row(tr);

        if (row.child.isShown()) {
            row.child.hide();
            tr.removeClass('shown');
            $(this).removeClass('btn-danger').addClass('btn-success').html('<i class="fa fa-plus-circle"></i>');
        } else {
            table.rows('.shown').every(function () {
                this.child.hide();
                $(this.node()).removeClass('shown').find('.expand-btn')
                    .removeClass('btn-danger')
                    .addClass('btn-success')
                    .html('<i class="fa fa-plus-circle"></i>');
            });

            const session = row.data()._raw;
const html = `
  <div class="smtp-log-container" title="Click to copy all log lines">
    ${session.Log.map(log => `
      <div><strong>${new Date(log.Timestamp).toLocaleString()}</strong> [${log.Direction}] ${log.Data}</div>
    `).join('')}
  </div>
`;
row.child(html).show();
            row.child(`<div style="padding-left: 2em; max-height: 300px; overflow-y: auto;">${html}</div>`).show();
            tr.addClass('shown');
            $(this).removeClass('btn-success').addClass('btn-danger').html('<i class="fa fa-minus-circle"></i>');
        }
    });
}


function formatSmtpLog(logArray) {
    return `
        <div style="padding-left: 2em; max-height: 300px; overflow-y: auto;">
            ${logArray.map(e => 
                `<div><strong>${new Date(e.Timestamp).toLocaleString()}</strong> 
                [${e.Direction}] ${e.Data}</div>`
            ).join('')}
        </div>`;
}

// Clipboard copy of entire log block
$(document).off('click', '.smtp-log-container').on('click', '.smtp-log-container', function () {
    const text = $(this).text().trim();
    navigator.clipboard.writeText(text).then(() => {
        $(this).addClass('copied-all');
        setTimeout(() => $(this).removeClass('copied-all'), 1000);
    }).catch(err => {
        console.error('Failed to copy full SMTP log block:', err);
    });
});
document.addEventListener('DOMContentLoaded', function () {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[title]'));
  tooltipTriggerList.forEach(function (el) {
    new bootstrap.Tooltip(el);
  });
});