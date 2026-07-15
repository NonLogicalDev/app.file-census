#!/usr/bin/env python3
"""Recover newest pre-cutoff COMPLETE content per UI file from Codex logs.

Handles compound `nl -ba A && nl -ba B` reads by splitting output at line-number
resets and mapping blocks to the ordered file list. Only trusts contiguous 1..N
nl/cat -n blocks (complete, verifiable). Reports current-vs-July and writes each
recovered file to /tmp/uirec/<basename>."""
import json, glob, os, re, sys
CUTOFF='2026-07-15T05:35:46.541Z'
OUT='/tmp/uirec'; os.makedirs(OUT,exist_ok=True)
TARGETS=[
 'ui/src/App.jsx','ui/src/components/Shell.jsx','ui/src/components/FileExplorer.jsx',
 'ui/src/components/FileGrid.jsx','ui/src/components/Icon.jsx','ui/src/components/AppModals.jsx',
 'ui/src/components/NotificationLayer.jsx','ui/src/components/ScanProgressPools.jsx',
 'ui/src/components/DirectoryTree.jsx',
 'ui/src/pages/DuplicatesPage.jsx','ui/src/pages/TasksPage.jsx','ui/src/pages/SearchPage.jsx',
 'ui/src/pages/LocationsPage.jsx','ui/src/pages/DashboardPage.jsx','ui/src/pages/OptionsPage.jsx',
 'ui/src/style.css','ui/src/components/ui/index.jsx','ui/src/components/ui/shellClasses.js',
 'ui/src/components/ui/fileGridClasses.js','ui/src/components/ui/explorerClasses.js',
 'ui/src/components/ui/pageClasses.js','ui/src/components/ui/detailClasses.js',
 'ui/src/components/command-palette/CommandPalette.jsx',
 'ui/src/components/command-palette/commandPaletteModel.js',
]
BN2T={os.path.basename(t):t for t in TARGETS}
BNS=set(BN2T)
def logs():
    out=[]
    for d in ['2026/07/11','2026/07/12','2026/07/14','2026/07/15']:
        out+=glob.glob(os.path.expanduser(f'~/.codex/sessions/{d}/*.jsonl'))
    return out
def walk(o):
    if isinstance(o,str): yield o
    elif isinstance(o,dict):
        for v in o.values(): yield from walk(v)
    elif isinstance(o,list):
        for v in o: yield from walk(v)
def cmd_string(p):
    for s in walk(p):
        m=re.search(r'"cmd":"((?:[^"\\]|\\.)*)"',s)
        if m:
            try: return json.loads('"'+m.group(1)+'"')
            except: return m.group(1)
        st=s.strip()
        if st.startswith(('nl -ba','cat ','cat -n','sed -n')): return st
    return None
def nl_file_sequence(cmd):
    """If cmd is a chain of `nl -ba PATH` / `cat -n PATH` (joined by && or newlines),
    with NO pipes/sed-range filters, return the ordered list of target basenames; else None."""
    if cmd is None: return None
    if '|' in cmd or 'sed -n' in cmd or 'rg ' in cmd or 'grep' in cmd: return None
    parts=re.split(r'&&|\n', cmd)
    seq=[]
    for part in parts:
        part=part.strip()
        if not part: continue
        m=re.match(r'(?:nl -ba|cat -n|cat)\s+(\S+)\s*$', part)
        if not m:
            # allow printf separators between reads
            if part.startswith('printf') or part.startswith('echo'): continue
            return None
        f=m.group(1).strip('"\'')
        seq.append(os.path.basename(f))
    if not seq or not any(b in BNS for b in seq): return None
    return seq
def clean_chunk(txt):
    if '{"chunk_id"' in txt and '"output"' in txt:
        i=txt.index('{"chunk_id"')
        try: return json.loads(txt[i:]).get('output',''),('truncated output' in txt)
        except: pass
    m=re.search(r'Output:\n\n',txt)
    if m: txt=txt[m.end():]
    return txt,('truncated output' in txt)
def split_nl_blocks(txt):
    """Split concatenated nl output into contiguous 1..N blocks. Returns list of body strings."""
    lines=txt.split('\n')
    blocks=[]; cur=None; expected=None
    for ln in lines:
        m=re.match(r'^\s*(\d+)\t(.*)$', ln)
        if not m:
            # continuation of a multi-line content line inside nl? nl numbers every line, so
            # a non-matching line likely belongs to previous content (rare). Attach if in block.
            if cur is not None and ln.strip()=='' : 
                continue
            continue
        n=int(m.group(1)); content=m.group(2)
        if n==1:
            if cur: blocks.append(cur)
            cur=[content]; expected=2
        elif cur is not None and n==expected:
            cur.append(content); expected+=1
        else:
            # gap/reset not to 1 -> close current, ignore stray
            if cur: blocks.append(cur); cur=None; expected=None
    if cur: blocks.append(cur)
    return ['\n'.join(b)+'\n' for b in blocks]

best={}  # bn -> (ts, body)
cmds={}  # cid -> (ts, seq)
for lg in logs():
    try: raw=open(lg,errors='replace').read()
    except: continue
    if not any(bn in raw for bn in BNS): continue
    for line in raw.splitlines():
        if not any(bn in line for bn in BNS): continue
        try: obj=json.loads(line)
        except: continue
        ts=obj.get('timestamp',''); p=obj.get('payload',{}); pt=p.get('type',''); cid=p.get('call_id')
        if not cid: continue
        if pt in ('custom_tool_call','function_call','local_shell_call'):
            seq=nl_file_sequence(cmd_string(p))
            if seq: cmds[cid]=(ts,seq)
        elif 'output' in pt and cid in cmds:
            ts0,seq=cmds[cid]
            if ts0>CUTOFF: continue
            out=p.get('output')
            txt='\n'.join(i.get('text','') for i in out if isinstance(i,dict)) if isinstance(out,list) else (out if isinstance(out,str) else '')
            content,trunc=clean_chunk(txt)
            if trunc: continue
            blocks=split_nl_blocks(content)
            if len(blocks)!=len(seq):
                # can't confidently map; skip (partial/truncated)
                continue
            for bn,body in zip(seq,blocks):
                if bn in BNS and (bn not in best or ts0>best[bn][0]):
                    best[bn]=(ts0,body)
def norm(s): return re.sub(r'[ \t]+\n','\n',s).rstrip('\n')
print(f"{'FILE':50}{'cur':>6}{'july':>6}  {'read_ts':21} status")
for t in TARGETS:
    bn=os.path.basename(t)
    cur=open(t).read() if os.path.exists(t) else None
    curln=cur.count('\n') if cur else 0
    b=best.get(bn)
    if not b:
        print(f"{t:50}{curln:>6}{'--':>6}  {'(no clean nl read)':21}"); continue
    ts,body=b
    open(os.path.join(OUT,bn),'w').write(body)
    same=cur is not None and norm(cur)==norm(body)
    print(f"{t:50}{curln:>6}{body.count(chr(10)):>6}  {ts[:19]} {'IDENTICAL' if same else 'DIFFERS<--recover'}")
