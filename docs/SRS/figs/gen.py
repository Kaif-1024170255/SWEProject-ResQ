import subprocess, html

BLACK="#000000"; G1="#D0CECE"; G2="#E7E6E6"
FONT="Helvetica"

def table(name, title, rows, port_rows=None, width=None):
    """HTML-like record table: black header, alternating grey rows."""
    port_rows = port_rows or {}
    s = f'{name} [shape=plaintext, label=<<TABLE BORDER="0" CELLBORDER="0" CELLSPACING="0" CELLPADDING="5">'
    s += f'<TR><TD BGCOLOR="{BLACK}" PORT="h"><FONT COLOR="white" FACE="{FONT}-Bold" POINT-SIZE="13"><B>{html.escape(title)}</B></FONT></TD></TR>'
    for i, r in enumerate(rows):
        bg = G1 if i % 2 == 0 else G2
        port = f' PORT="{port_rows[r]}"' if r in port_rows else ''
        s += f'<TR><TD BGCOLOR="{bg}"{port}><FONT FACE="{FONT}" POINT-SIZE="11">{html.escape(r)}</FONT></TD></TR>'
    s += '</TABLE>>];\n'
    return s

def stub(name, title):
    return (f'{name} [shape=plaintext, label=<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="0" CELLPADDING="6" STYLE="DASHED">'
            f'<TR><TD BGCOLOR="white"><FONT FACE="{FONT}-Bold" POINT-SIZE="12"><B>{html.escape(title)}</B></FONT><BR/>'
            f'<FONT FACE="{FONT}" POINT-SIZE="9">(defined in an earlier figure)</FONT></TD></TR></TABLE>>];\n')

def render(name, dot):
    open(f'{name}.dot','w').write(dot)
    subprocess.run(['dot','-Tpdf',f'{name}.dot','-o',f'{name}.pdf'],check=True)

HDR_EDGE = f'edge [fontname="{FONT}", fontsize=10, color="#222222", penwidth=1.2, arrowsize=0.8];\n'

# ---------- Figure 1: entire work-flow ----------
f1 = f'''digraph G {{
 rankdir=TB; nodesep=0.9; ranksep=1.0; bgcolor="white";
 node [shape=ellipse, fontname="{FONT}-Bold", fontsize=14, penwidth=1.2, width=2.1, height=0.95];
 edge [fontname="{FONT}", fontsize=13, fontcolor="#1F3864", penwidth=1.3, color="#111111"];
 AP [label="Affected\\nPerson"]; ADM [label="Administrator"]; RES [label="Responders"];
 REQ [label="Emergency\\nRequest"]; RP [label="Resource\\nProviders"]; SUP [label="Supplies"];
 {{rank=same; AP; ADM; RES}}
 AP -> REQ [label="submits"];
 ADM -> REQ [label="verifies"];
 RES -> REQ [label="claim and\\nresolve"];
 AP -> REQ [label="confirms\\nresolution of"];
 RP -> SUP [label="register"];
 SUP -> REQ [label="fulfil needs of"];
 {{rank=same; RP; REQ}}
}}'''
render('fig_workflow', f1)

# ---------- Figure 2: user types ----------
f2 = f'''digraph G {{
 rankdir=TB; splines=ortho; nodesep=0.5; ranksep=0.6; bgcolor="white";
 node [shape=box, style=rounded, fontname="{FONT}-Bold", fontsize=14, penwidth=1.2, width=2.1, height=0.55];
 edge [penwidth=1.3, color="#111111", arrowsize=0.8];
 U [label="Users"]; AP [label="Affected Persons"]; RS [label="Responders"];
 RP [label="Resource Providers"]; AD [label="Administrators"];
 V [label="Volunteers"]; N [label="NGO Members"];
 U -> AP; U -> RS; U -> RP; U -> AD;
 RS -> V; RS -> N;
}}'''
render('fig_users', f2)

# ---------- Figure 3: core request data ----------
users = ["name","email","passwordHash","role","organizationId","location","skills","availability_window","createdAt"]
org   = ["name","type","registrationNo","contact","region","isVerified"]
req   = ["requestId","category","description","urgency","status","contactPhone","createdBy","claimedBy","claimedOrg","incidentId","statusHistory[]","createdAt"]
loc   = ["preciseLat","preciseLng","publicLat","publicLng"]
ver   = ["requestId","verifiedBy","result","method","remarks","priorityAssessment","timestamp"]
asg   = ["requestId","userId","organizationId","assignedAt","status"]
f3 = 'digraph G {\n rankdir=LR; nodesep=0.45; ranksep=1.0; bgcolor="white";\n' + HDR_EDGE
f3 += table('USERS','Users',users) + table('ORG','Organization',org) + table('REQ','Request',req)
f3 += table('LOC','Location (embedded)',loc) + table('VER','Verification',ver) + table('ASG','RequestAssignment',asg)
f3 += ' USERS -> ORG;\n REQ -> USERS;\n REQ -> LOC;\n VER -> REQ;\n ASG -> REQ;\n ASG -> USERS;\n}\n'
render('fig_data_core', f3)

# ---------- Figure 4: resource data ----------
res  = ["name","type","unit","perishable","organizationId"]
inv  = ["resourceId","organizationId","quantityAvailable","quantityReserved"]
rr   = ["requestId","resourceId","requiredQty","allocatedQty","status"]
f4 = 'digraph G {\n rankdir=LR; nodesep=0.5; ranksep=1.0; bgcolor="white";\n' + HDR_EDGE
f4 += stub('ORG','Organization') + stub('REQ','Request')
f4 += table('RES','Resource',res) + table('INV','ResourceInventory',inv) + table('RR','RequestResource',rr)
f4 += ' RES -> ORG;\n INV -> RES;\n INV -> ORG;\n RR -> REQ;\n RR -> RES;\n}\n'
render('fig_data_resource', f4)

# ---------- Figure 5: communication and coordination data ----------
msg = ["requestId","senderId","body","sentAt"]
ntf = ["userId","requestId","type","message","readAt"]
evd = ["requestId","uploadedBy","fileType","fileUrl","uploadedAt"]
inc = ["name","description","severity","centre","radius"]
cat = ["name","description","priorityLevel","isActive"]
f5 = 'digraph G {\n rankdir=LR; nodesep=0.45; ranksep=1.0; bgcolor="white";\n' + HDR_EDGE
f5 += stub('USERS','Users') + stub('REQ','Request')
f5 += table('MSG','Message',msg) + table('NTF','Notification',ntf) + table('EVD','Evidence',evd)
f5 += table('INC','Incident',inc) + table('CAT','EmergencyCategory',cat)
f5 += ' MSG -> REQ;\n MSG -> USERS;\n NTF -> USERS;\n NTF -> REQ;\n EVD -> REQ;\n REQ -> INC;\n REQ -> CAT;\n}\n'
render('fig_data_comm', f5)

# ---------- Figure 6: citizen activities ----------
f6 = f'''digraph G {{
 rankdir=TB; compound=true; nodesep=0.45; ranksep=0.55; bgcolor="white";
 node [shape=box, style=rounded, fontname="{FONT}", fontsize=12, penwidth=1.1, width=1.35, height=0.7];
 edge [penwidth=1.3, color="#111111", arrowsize=0.8];
 subgraph cluster_a {{ label=<<B>Request Submission</B>>; labelloc=b; fontname="{FONT}-Bold"; fontsize=15; margin=18;
   START [label="Affected Person\\nor Bystander"];
   A1 [label="Describe\\nEmergency"]; A2 [label="Pin Location\\non Map"]; A3 [label="Receive\\nTracking ID"];
   {{rank=same; START; A1; A2; A3}}
   START -> A1 -> A2 -> A3; }}
 subgraph cluster_b {{ label=<<B>Request Tracking</B>>; labelloc=b; fontname="{FONT}-Bold"; fontsize=15; margin=18;
   B1 [label="Watch Live\\nStatus"]; B2 [label="Message\\nResponder"]; B3 [label="Confirm\\nResolution"];
   {{rank=same; B1; B2; B3}}
   B1 -> B2 -> B3; }}
 A1 -> B1 [style=invis];
 A3 -> B1 [ltail=cluster_a, lhead=cluster_b, constraint=false];
 {table('PAGE','Citizen Tracking Page',["Tracking ID","Status Timeline","Communications Log","Supply Needs","Withdraw Request"])}
 B3 -> PAGE:h [ltail=cluster_b];
}}'''
render('fig_act_citizen', f6)

# ---------- Figure 7: administrator and responder activities ----------
adm = ["Verify Request","Review Ranked Matches","Invite Responder","Manage Categories and Incidents","View Analytics"]
rsp = ["Claim Request","Allocate Supplies (NGO)","Message Citizen","Mark Resolved"]
f7 = f'''digraph G {{
 rankdir=LR; nodesep=0.5; ranksep=1.1; bgcolor="white";
 edge [penwidth=1.3, color="#111111", arrowsize=0.8];
 subgraph cluster_x {{ label=<<B>Administrator and Responders</B>>; labelloc=b; fontname="{FONT}-Bold"; fontsize=16; margin=22;
 {table('ADM','Administrator',adm,{"Invite Responder":"inv"})}
 {table('RSP','Responder (Volunteer or NGO Member)',rsp)}
 }}
 ADM:inv:e -> RSP:h:w [headport=w];
}}'''
render('fig_act_admin', f7)

# ---------- Figure 8: resource provider activities ----------
f8 = f'''digraph G {{
 bgcolor="white";
 subgraph cluster_x {{ label=<<B>Resource Provider</B>>; labelloc=b; fontname="{FONT}-Bold"; fontsize=16; margin=22;
 {table('RP','Resource Provider',["Register Resource","Manage Inventory","Allocate Supplies to Request"])}
 }}
}}'''
render('fig_act_provider', f8)
print("ok")
