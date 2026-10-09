import asyncio, json, sys, edge_tts, os
lines = json.load(open(sys.argv[1])); out = sys.argv[2]; voice = sys.argv[3]; rate = sys.argv[4]
async def one(i, text):
    c = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    words=[]; audio=bytearray()
    async for ch in c.stream():
        if ch["type"]=="audio": audio += ch["data"]
        elif ch["type"]=="WordBoundary":
            words.append({"t":ch["offset"]/1e7,"d":ch["duration"]/1e7,"w":ch["text"]})
    open(f"{out}/{i}.mp3","wb").write(audio)
    json.dump(words, open(f"{out}/{i}.json","w"), ensure_ascii=False)
async def main():
    for i,t in lines:
        for k in range(4):
            try: await one(i,t); break
            except Exception as e: print("retry",i,e); await asyncio.sleep(2)
asyncio.run(main())
