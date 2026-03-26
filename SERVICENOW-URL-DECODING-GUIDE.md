# ServiceNow URL Decoding - Complete Guide

## 🎯 Overview
This guide explains how the ServiceNow Audio Alert Chrome extension handles complex ServiceNow URLs and encoded queries.

## 📋 Table of Contents
1. [URL Formats Supported](#url-formats-supported)
2. [Encoding Levels](#encoding-levels)
3. [Query Operators](#query-operators)
4. [Field Mappings](#field-mappings)
5. [Debugging Features](#debugging-features)
6. [Real Examples](#real-examples)
7. [Troubleshooting](#troubleshooting)

## 🌐 URL Formats Supported

### Old Format (Classic UI)
```
https://instance.service-now.com/sn_customerservice_case_list.do?sysparm_query=stateIN6^impactIN4,5,6
```

### New Format (Now UI)
```
https://instance.service-now.com/now/nav/ui/classic/params/target/sn_customerservice_case_list.do%3Fsysparm_query%3DstateIN6%255EimpactIN4%252C5%252C6
```

### REST API Format
```
https://instance.service-now.com/api/now/table/sn_customerservice_case_list?sysparm_query=stateIN6%5EimpactIN4%2C5%2C6&JSONv2&sysparm_fields=...
```

## 🔄 Encoding Levels

| Level | Example | Description |
|--------|---------|------------|
| Single | `state=2` | Basic URL encoding |
| Double | `state%3D2` | ServiceNow UI encoding |
| Triple | `state%253D2` | New UI with extra encoding |
| Quadruple | `state%25253D2` | Multiple encoding layers |

## 🔧 Query Operators

| Operator | Symbol | Meaning | Example |
|---------|--------|---------|---------|
| AND | `^` | Logical AND | `state=2^priority=1` |
| OR | `^OR` | Logical OR | `state=2^ORpriority=1` |
| New Query | `^NQ` | Separate query block | `...^NQactive=false` |
| Equals | `=` | Exact match | `priority=1` |
| Not Equals | `!=` | Not equal | `priority!=1` |
| Contains | `LIKE` | Substring | `short_descriptionLIKEIssue` |
| Starts With | `STARTSWITH` | Prefix | `numberSTARTSWITHINC` |
| Ends With | `ENDSWITH` | Suffix | `numberENDSWITH001` |

## 📊 Field Mappings

### State Field
```
1 = New
2 = In Progress  
3 = On Hold
6 = Resolved
7 = Closed
8 = Canceled
```

### Priority Field
```
1 = Critical
2 = High
3 = Medium
4 = Low
5 = Planning
```

### Common Fields
- `number`: Ticket number
- `short_description`: Brief description
- `assigned_to`: Assignee (sys_id or display name)
- `assignment_group`: Team assignment
- `state`: Current state
- `priority`: Priority level
- `impact`: Business impact
- `u_next_step_date_and_time`: Next action deadline

## 🐛 Debugging Features

### Console Output
The extension provides detailed console logging:

```
=== ENHANCED SERVICENOW URL PROCESSING ===
Input URL: [original URL]
Extracted ServiceNow query: [decoded query]
Parsed conditions: [array of conditions]
Query Analysis:
- Total conditions: [number]
- Active tickets: [number]
- Resolved tickets: [number]
- Priority level: [Critical/High/Medium]
- States: [New, In Progress, Resolved]
- Fields used: [state, priority, assigned_to, ...]
Final REST API URL: [constructed URL]
```

### Query Breakdown
Each condition is parsed into:
- **Field**: The ServiceNow field name
- **Operator**: The comparison operator (=, !=, LIKE, etc.)
- **Value**: The raw encoded value
- **Display Value**: Human-readable choice mapping

## 📚 Real Examples

### Example 1: Simple Query
**Input:**
```
https://instance.service-now.com/sn_customerservice_case_list.do?sysparm_query=state=2^priority=1
```

**Decoded Output:**
```
- Total conditions: 2
- Active tickets: 1 (state=In Progress)
- Priority level: Critical
- States: In Progress
- Fields used: state, priority
```

### Example 2: Complex Query with Special Characters
**Input:**
```
https://instance.service-now.com/now/nav/ui/classic/params/target/sn_customerservice_case_list.do%3Fsysparm_query%3DstateIN6%255EimpactIN4%252C5%252C6%255Eu_acknowledgement%253Dtrue%255Eu_status_reasonNOT%2520IN20%252C68%255EORu_status_reason%253D%255Eactive%253Dtrue%255Eu_first_assignment_group%253D6b28bf5cdbc4d1946f316a9ed3961932%255EORassignment_group%253D6b28bf5cdbc4d1946f316a9ed3961932%255Eproduct.type%253DIP%255EORproduct.type%253DSDWAN%255Eu_status_reason!%253D100%255EORu_status_reason%253D%255Eu_status_reason!%253D20%255EORu_status_reason%253D%255Eu_rfo_ready%253Dfalse%255Eassignment_groupNOT%2520LIKEIPSOC_%2520Eco%2526IZOInternet%255Eshort_descriptionNOT%2520LIKEBB%255EORshort_descriptionISEMPTY%255Eassignment_group!%253D0eb19a1047acca10b97e4497436d4374%255EORassignment_group%253D
```

**Decoded Output:**
```
- Total conditions: 22
- Active tickets: 21 (excluding resolved)
- Priority level: High (priority=2)
- States: New, In Progress, On Hold
- Fields used: state, impact, parent, u_acknowledgement, u_status_reason, active, u_first_assignment_group, assignment_group, product.type, u_status_reason, u_rfo_ready, assignment_group, short_description
```

### Example 3: Sys ID Reference
**Input:**
```
assigned_to=6816f79cc0a8016401c5a33be04be441
```

**Decoded Output:**
```
- Field: assigned_to
- Value: [Sys ID: 6816f79cc0a8016401c5a33be04be441]
- Display: John Doe (if sysparm_display_value=true)
```

## 🔧 Troubleshooting

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|--------|----------|
| Query truncation | `&` character treated as separator | Use `encodeURIComponent()` |
| Encoding failures | Invalid characters | Progressive decoding with error handling |
| Missing conditions | Pattern mismatch | Multiple regex patterns |
| Display values not showing | Missing `sysparm_display_value=true` | Add display parameter |

### Best Practices

1. **Always use `sysparm_display_value=true`** for readable values
2. **Test with complex queries** containing special characters
3. **Monitor console output** for debugging
4. **Handle both old and new URL formats** automatically
5. **Use progressive decoding** for multiple encoding levels

## 🚀 Advanced Features

### Multi-Query Support
The decoder handles `^NQ` (New Query) blocks for complex filtering:
```
state=2^priority=1^NQactive=false^close_code=Not Solved
```

### Choice Field Decoding
Automatically converts numeric codes to readable labels:
- State codes (1, 2, 3, 6, 7, 8)
- Priority levels (1-5)
- Custom choice mappings

### Special Character Preservation
Internal `&`, `=`, `^`, spaces, and Unicode characters are properly encoded/decoded without data loss.

## 📖 For Extension Development

### Integration Steps
1. **Copy decoder functions** to your project
2. **Replace `changeURLforRESTAPI()`** calls
3. **Add console logging** for debugging
4. **Test with real URLs** from your ServiceNow instance

### Testing Recommendations
1. **Test old format URLs** from classic ServiceNow UI
2. **Test new format URLs** from Now UI
3. **Test complex queries** with multiple conditions
4. **Test edge cases** like empty queries, malformed URLs

## 📞 Support

For issues with URL decoding:
1. **Check console output** - all steps are logged
2. **Verify query完整性** - count conditions vs expected
3. **Test encoding levels** - try double/triple encoded URLs
4. **Report issues** - include URL and console output

---

*This guide is based on official ServiceNow documentation and real-world testing with the audio alert extension.*
