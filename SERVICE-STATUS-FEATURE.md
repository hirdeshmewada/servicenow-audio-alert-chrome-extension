# Service Status Feature - Implementation Summary

## Overview
Added a new "Service Status" button to the Chrome extension that silently triggers FLT diagnostics and extracts Ping/BGP logs without creating work notes or ticket updates.

## Technical Approach

### 1. New Module: `acknowledgement/serviceStatus.js`
- Reuses existing case context detection from Initial Acknowledgement
- **Injects bridge script into ServiceNow page context** to use GlideAjax
- Triggers FLT via injected script (no direct API calls)
- Polls `list_history.do` API for new entries
- Extracts "Insights: Diagnostic Update" entries
- Parses Ping and BGP logs based on message content
- Formats output and copies to clipboard

### 2. Bridge Script: `acknowledgement/serviceNowBridge.js`
- Injected into ServiceNow page context
- Uses `GlideAjax('global.CSNPH2_FLT_Trigger')` to trigger FLT
- Communicates with extension via `window.postMessage`
- Maintains ServiceNow session context and authentication

### 2. Key Functions

#### `ServiceStatus.getCaseContext()`
- Gets active tab and extracts ServiceNow case sys_id
- Reuses URL parsing logic from Initial Acknowledgement
- Falls back to chrome.storage.sync for root URL if needed

#### `ServiceStatus.triggerFLT(origin, caseSysId)`
- Injects bridge script into active ServiceNow tab
- Sends message to bridge script via `window.postMessage`
- Bridge script uses `GlideAjax('global.CSNPH2_FLT_Trigger')` in page context
- Waits for response from bridge script
- Silent execution - no UI clicks or page refreshes

#### `ServiceStatus.pollListHistory(origin, caseSysId)`
- Polls `list_history.do` API up to 15 attempts
- Waits 2 seconds between attempts
- Handles both JSON and HTML responses
- Returns new work note entries

#### `ServiceStatus.findDiagnosticUpdate(entries)`
- Searches for "Insights: Diagnostic Update" in entries
- Returns the first matching entry

#### `ServiceStatus.extractDiagnostics(entry)`
- Checks message field for diagnostic type:
  - `message.includes('ping response is ok')` → Ping logs
  - `message.includes('protocol is up')` → BGP logs
- Extracts raw CLI output from logs field
- Cleans up prefixes and HTML tags

#### `ServiceStatus.formatOutput(diagnostics)`
- Formats output as:
  ```
  ===== SERVICE STATUS =====

  PING STATUS
  -----------
  [raw ping CLI output]

  BGP STATUS
  ----------
  [raw BGP CLI output]
  ```

### 3. UI Changes

#### `options.html`
- Added "Service Status" button below "Generate Initial Acknowledgement"
- Styled as `btn-default` (secondary button style)
- Added script reference to `serviceStatus.js`

#### `js/options.js`
- Added event listener for `generateServiceStatusBtn`
- Added `generateServiceStatus()` function
- Shows status messages during execution
- Handles errors and button state

### 4. Integration Points

#### No Changes to Existing Functionality
- Initial Acknowledgement button remains unchanged
- Both buttons work independently
- Reuses existing authentication/session cookies
- No changes to background service worker
- No changes to manifest.json

#### Shared Code
- Case context detection (reused from Initial Acknowledgement)
- Fetch utilities (reused from Initial Acknowledgement)
- Clipboard functionality (reused from clipboard.js)

## Flow Diagram

```
User clicks "Service Status"
          ↓
Get current tab sys_id
          ↓
Inject bridge script into ServiceNow page
          ↓
postMessage → Bridge Script
          ↓
Bridge Script: GlideAjax('global.CSNPH2_FLT_Trigger')
          ↓
FLT executes in ServiceNow backend
          ↓
postMessage ← Response to Extension
          ↓
Wait 5 seconds
          ↓
Poll list_history.do (15 attempts, 2s interval)
          ↓
Parse entries (JSON or HTML)
          ↓
Find "Insights: Diagnostic Update"
          ↓
Extract Ping/BGP logs based on message
          ↓
Format output
          ↓
Copy to clipboard
```

## Differences from FLT Re-Trigger

| Aspect | FLT Re-Trigger | Service Status |
|--------|---------------|----------------|
| UI Interaction | Clicks button on page | Silent API call |
| Work Notes | Creates 10-20 entries | No work notes |
| Ticket Updates | Adds to journal | No updates |
| Output | Visible in ticket | Clipboard only |
| Logs | Full diagnostic | Ping + BGP only |
| Message | "Insights: Diagnostic Update" | N/A (silent) |

## API Endpoints Used

### List History Poll
```
GET https://{instance}.service-now.com/list_history.do?
  sysparm_type=list_history
  &table=sn_customerservice_case
  &action=get_new_entries
  &sysparm_silent_request=true
  &sysparm_auto_request=true
  &sysparm_timestamp={timestamp}
  &include_attachments=
  &sys_id={case_sys_id}
```

### FLT Trigger (via Bridge Script)
The FLT trigger is executed via injected bridge script using ServiceNow's GlideAjax:
```javascript
var ga = new GlideAjax('global.CSNPH2_FLT_Trigger');
ga.addParam('sysparm_name', 'fltTrigger');
ga.addParam('sysparm_id', caseSysId);
ga.getXML(callback);
```

This runs in ServiceNow page context and uses existing authentication.

## Log Detection Logic

### Ping Logs
- Message contains: "ping response is ok" or "pe-cpe ping"
- Extracts complete Logs block with CLI output

### BGP Logs
- Message contains: "protocol is up" or "bgp" or "no issue on lm"
- Extracts complete Logs block with CLI output

## Output Format Example

```
===== SERVICE STATUS =====

PING STATUS
-----------
cn-me01-hpe04 ping router 20463 10.124.226.46 timeout 1 rapid count 50

PING 10.124.226.46 56 data bytes

!!!!!!!!!!!!!!!!!!!!!!!!!!!

50 packets transmitted,
50 packets received,
0.00% packet loss

round-trip min = 0.752ms,
avg = 0.816ms,
max = 0.992ms

BGP STATUS
----------
cn-me01-hpe04 show router 20463 bgp summary | match "10.124.226.46" context all

10.124.226.46
               65264   250379    0 40d14h47m 6/5/89 (IPv4)
                      2127537    0
```

## Error Handling

1. **No active tab**: Error message "No active tab found"
2. **No ServiceNow tab**: Error message "Open a ServiceNow case tab"
3. **Bridge script injection failure**: Error "Could not inject bridge script"
4. **Bridge script timeout**: Error "Bridge script not ready within timeout"
5. **FLT trigger failure**: Error from GlideAjax response
6. **No diagnostic entries**: Error "No Insights Diagnostic Update found"
7. **No logs extracted**: Warning but continues
8. **Clipboard failure**: Error "Failed to copy to clipboard"

## Why GlideAjax Bridge Approach?

### Problem with Direct xmlhttp.do Calls
- Chrome extensions run in `chrome-extension://` origin
- ServiceNow xmlhttp.do requires authenticated session context
- Direct fetch/XHR from extension results in **401 Unauthorized**
- Missing ServiceNow session cookies and CSRF tokens
- GlideAjax is not available in extension context

### Solution: Injected Bridge Script
- Bridge script runs in ServiceNow page context (`https://tatain.service-now.com`)
- Has access to ServiceNow session cookies and authentication
- Can use `GlideAjax()` API natively
- Communicates with extension via `window.postMessage`
- Maintains same authentication as existing FLT Re-Trigger button

### Architecture Benefits
✅ Uses existing ServiceNow session (no new auth needed)
✅ Same mechanism as FLT Re-Trigger button
✅ No 401 authentication errors
✅ Maintains ServiceNow security context
✅ Works with GlideAjax and all ServiceNow APIs

## Testing Checklist

- [ ] Button appears in options popup
- [ ] Button is disabled during execution
- [ ] Status messages show during execution
- [ ] Bridge script injects successfully
- [ ] FLT trigger executes via GlideAjax (no 401 error)
- [ ] Polling waits for diagnostic entries
- [ ] Ping logs extracted correctly
- [ ] BGP logs extracted correctly
- [ ] Output copied to clipboard
- [ ] No work notes created in ticket
- [ ] Initial Acknowledgement still works
- [ ] Error handling works correctly

## Future Enhancements

1. Add configurable polling interval
2. Add timeout configuration
3. Support for additional diagnostic types (traceroute, etc.)
4. Add history of recent service status checks
5. Support for multiple diagnostic extractions in one run
6. Add visualization of log data

## Files Modified

1. `acknowledgement/serviceStatus.js` - NEW
2. `acknowledgement/serviceNowBridge.js` - NEW (bridge script for GlideAjax)
3. `options.html` - Added button and script reference
4. `js/options.js` - Added event listener and handler function

## Files Unchanged

- `acknowledgement/acknowledgement.js` - Initial Acknowledgement
- `acknowledgement/template.js` - Template logic
- `acknowledgement/diagnosticParser.js` - Diagnostic parsing
- `acknowledgement/clipboard.js` - Clipboard utilities
- `js/background.js` - Service worker
- `manifest.json` - Extension manifest (no changes needed)

## API Response Structure

### list_history.do Response
Returns JSON with nested structure:
```json
{
  "entries": [
    {
      "entries": {
        "journal": [
          {
            "new_value": "FLT ID: 17927501031431<br><h3>Insights: Diagnostic Update</h3><table border=\"1\" cellpadding=\"4\"><tbody><tr><td><b>Message</b></td><td><b>Logs</b></td></tr><tr><td>No Issue On LM. PE-CPE protocol is UP...</td><td>cn-me01-hpe04 show router 20463 bgp summary...</td></tr></tbody></table>"
          }
        ]
      }
    }
  ]
}
```

The journal entries contain HTML with:
- **Message**: First table cell (`<td>`)
- **Logs**: Second table cell (`<td>`)
- HTML tags: `<br>`, `<table>`, `<td>`, `<tr>`, `<tbody>`, etc.
- Encoded entities: `&#34;` (quotes), `&nbsp;` (spaces), etc.
- Structure: Table with Message and Logs columns
- Multiple entries: Separate entries for Ping and BGP diagnostics

## Actual Log Examples

### Ping Diagnostic Entry
```
Message: PE-CPE ping response is OK, Engineer to verify service with customer
Logs: cn-me01-hpe04 ping router 20463 10.124.226.46 timeout 1 rapid count 50
       PING 10.124.226.46 56 data bytes
       !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
       50 packets transmitted, 50 packets received, 0.00% packet loss
       round-trip min = 0.752ms, avg = 0.816ms, max = 0.992ms
```

### BGP Diagnostic Entry
```
Message: No Issue On LM. PE-CPE protocol is UP. Engineer to verify customer service
Logs: cn-me01-hpe04 show router 20463 bgp summary | match "10.124.226.46" context all
       10.124.226.46
                65264   250379    0 40d14h47m 6/5/89 (IPv4)
                       2127537    0
```

## Key Implementation Updates

Based on actual API responses:

1. **JSON Parsing**: Updated to handle nested structure `data.entries[].entries.journal[]`
2. **HTML Extraction**: Parses table structure with Message and Logs columns
3. **Entity Decoding**: Handles `&#34;`, `&nbsp;`, `&amp;`, etc.
4. **Multiple Entries**: Returns all diagnostic entries (Ping and BGP are separate)
5. **Duplicate Removal**: Removes duplicate command lines from output
6. **Suffix Cleaning**: Removes "B:#" suffix from logs
7. **Line Breaks**: Converts `<br>` tags to newlines
