import json, math, sys, os
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
g = json.load(open(f"{S}/audio/grid.json")); T = g["T"]; t0 = g["t0"]
def bt(k): return t0 + k*T
def tb(t): return (t - t0)/T
script = dict(json.load(open(f"{S}/tools/script.json")))
script.update(dict(json.load(open(f"{S}/tools/script_h2.json"))))
W = {k: json.load(open(f"{S}/tts/{k}.json")) for k in script}
narr = []
def speech_end(k): w = W[k][-1]; return w["t"] + w["d"]
def put(k, file_start):
    ws = [{"w": x["w"], "t": file_start + x["t"], "d": x["d"]} for x in W[k]]
    narr.append({"id": k, "text": script[k], "start": file_start, "end": file_start + speech_end(k), "words": ws})
    return file_start + speech_end(k)
def anchor(k, wi, t): return put(k, t - W[k][wi]["t"])
def after(k, prev_end, gap=0.32, q=0.5):
    on = prev_end + gap                    # earliest speech onset
    kb = math.ceil(tb(on)/q - 1e-6)*q      # quantize onset to half-beat grid
    return put(k, bt(kb) - W[k][0]["t"])
def at_beat(k, kb): return put(k, bt(kb) - W[k][0]["t"])
def next_bar(t, slack=0.0): return math.ceil((tb(t) + slack)/4 - 1e-6)*4
scenes = []
def pin(v, want):
    assert v <= want, (v, want)
    return want
def scene(name, b0, b1, **kw): scenes.append(dict(name=name, b0=b0, b1=b1, **kw))

# ---- HOOK: bars 0-8; "爽" lands on the drop (beat 32)
a3s = bt(32) - 0.03 - W["A3"][8]["t"]
a2s = bt(25) - 0.03 - W["A2"][2]["t"]
a1s = a2s + W["A2"][0]["t"] - 0.40 - speech_end("A1")
put("A1", a1s); put("A2", a2s); put("A3", a3s)
scene("hook", 0, 32)
# ---- TITLE
scene("title", 32, 40)
# ---- DEFINE
e = at_beat("B1", 40.5)
e = after("B2", e, 0.4)
b = pin(next_bar(e, 0.5), 64); scene("define", 40, b)
# ---- R1 prediction
c1 = b; at_beat("C1", c1)
e = at_beat("C2", c1 + 4)
e = after("C3", e, 0.35)
e = after("C4", e, 0.35)
e = pin(e, bt(101.5)) and at_beat("C5", 102)
d0 = pin(next_bar(e, 0.4), 108); scene("r1", c1, d0)
# demo: card A (2) | A (6) | card B (2) | B (6) | side by side (8)
at_beat("C6a", d0); at_beat("C6b", d0 + 8); at_beat("C6c", d0 + 16)
scene("demoA", d0, d0 + 24, parts=[["cardA", d0, d0+2], ["random", d0+2, d0+8], ["cardB", d0+8, d0+10], ["beat", d0+10, d0+16], ["side", d0+16, d0+24]])
# ---- R2 binding
c2 = d0 + 24; at_beat("D1", c2)
e = at_beat("D2", c2 + 4)
e = after("D3", e, 0.35)
p0 = next_bar(e, 0.3); scene("r2", c2, p0)
scene("pip", p0, p0 + 16)
e = at_beat("D3b", p0 + 16)
e = after("D4", e, 0.4)
w1 = next_bar(e, 0.3); scene("r2b", p0 + 16, w1)
# ---- the clap lab: intro line, three one-bar trials (sync / sound early / sound late), the result
e = at_beat("D4x", w1)
tr0 = next_bar(e, 0.3)
e = at_beat("D4y", tr0 + 12)
w2 = next_bar(e, 0.4); scene("lab", w1, w2, trials=[[tr0, 0.0], [tr0 + 4, -0.1], [tr0 + 8, 0.1]])
e = at_beat("D5", w2)
c3 = next_bar(e, 0.6); scene("r2c", w2, c3)
# ---- R3 groove
at_beat("E1", c3)
e = at_beat("E2", c3 + 4)
e = after("E3", e, 0.35)
c4 = next_bar(e, 0.6)
if (c4//4) % 2: c4 += 4
scene("r3", c3, c4)
# ---- R4 tension: build of 8 bars (src 36-43), drop at c4+32
at_beat("F1", c4)
e = at_beat("F2", c4 + 6)
e = after("F3", e, 0.5)
drop = c4 + 32
scene("r4", c4, drop, silence=[drop-2, drop])
scene("showcase", drop, drop + 16)
# ---- BALANCE
c5 = drop + 16
e = at_beat("G1", c5 + 0.0)
e = after("G2", e, 0.4)
e = after("G3", e, 0.4)
c6 = next_bar(e, 0.5); scene("balance", c5, c6)
# ---- OUTRO
e = at_beat("H1", c6)
h = next_bar(e, 0.2)
for i, k in enumerate(["H2a", "H2b", "H2c", "H2d"]): at_beat(k, h + 2*i)
e = narr[-1]["end"]
s7 = h + 8; scene("summary", c6, s7)
e = at_beat("H3", s7 + 0.5)
s8 = next_bar(e, 1.0)
if (s8//4) % 2: s8 += 4
scene("reveal", s7, s8)
scene("end", s8, s8 + 8)
total_beats = s8 + 8
for s in scenes: print(f"{s['name']:9s} beats {s['b0']:6.1f}-{s['b1']:6.1f}  bars {s['b0']/4:5.1f}-{s['b1']/4:5.1f}  t {bt(s['b0']):6.2f}-{bt(s['b1']):6.2f}")
for n in narr: print(f"  {n['id']:4s} {n['start']:7.2f} -> {n['end']:7.2f}  beat {tb(n['words'][0]['t']):6.2f}-{tb(n['end']):6.2f}")
print("total", total_beats, "beats", total_beats/4, "bars", bt(total_beats), "s")
json.dump({"T": T, "t0": t0, "total_beats": total_beats, "scenes": scenes, "narr": narr}, open(f"{S}/film/timeline.json", "w"), ensure_ascii=False, indent=1)
