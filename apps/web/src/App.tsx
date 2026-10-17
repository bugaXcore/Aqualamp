import { useEffect, useState } from "react";
import { ChannelDial } from "@/components/ChannelDial";
import { StatusChip } from "@/components/StatusChip";
import { Button } from "@/components/ui/button";
import { useBridge } from "@/hooks/useBridge";
import { channelsToCss, type Channels } from "@/lib/bridge";

const CHANNEL_META: {
  key: keyof Channels;
  label: string;
  accent: string;
}[] = [
  { key: "red", label: "Red", accent: "#f87171" },
  { key: "green", label: "Green", accent: "#4ade80" },
  { key: "blue", label: "Blue", accent: "#60a5fa" },
  { key: "white", label: "White", accent: "#e2e8f0" },
];

export default function App() {
  const bridge = useBridge();
  const [local, setLocal] = useState<Channels>(bridge.channels);
  const connected = bridge.state === "connected";
  const busy = bridge.state === "connecting" || bridge.state === "scanning";

  useEffect(() => {
    setLocal(bridge.channels);
  }, [bridge.channels]);

  const updateChannel = (key: keyof Channels, value: number) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    bridge.setChannels({ [key]: value });
  };

  const mix = channelsToCss(local);

  return (
    <div className="app-shell">
      <div className="caustics" aria-hidden />
      <div className="depth-glow" aria-hidden />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <div className="font-[Syne] text-lg font-bold tracking-tight text-teal-50/90 sm:text-xl">
          AquaLamp
        </div>
        <StatusChip state={bridge.state} mock={bridge.mock} />
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-5xl flex-col px-5 pb-10 sm:px-8">
        {!connected ? (
          <section className="hero-enter flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="font-[Syne] text-6xl font-extrabold tracking-tight text-white sm:text-7xl md:text-8xl">
              AquaLamp
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-teal-100/70 sm:text-lg">
              Balance your Week Aqua light — cool channels, clear water light.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              <Button
                size="lg"
                className="min-w-[12rem]"
                disabled={!bridge.socketOpen || busy}
                onClick={() => bridge.connect()}
              >
                {busy ? "Connecting…" : "Connect"}
              </Button>
              {(bridge.bridgeError || bridge.error) && (
                <p className="max-w-sm text-sm text-rose-200/90">
                  {bridge.error ?? bridge.bridgeError}
                  {bridge.error && (
                    <button
                      type="button"
                      className="ml-2 underline decoration-rose-200/50 underline-offset-2"
                      onClick={() => bridge.connect()}
                    >
                      Retry
                    </button>
                  )}
                </p>
              )}
              {!bridge.socketOpen && !bridge.bridgeError && (
                <p className="text-sm text-teal-100/50">Reaching bridge…</p>
              )}
            </div>
          </section>
        ) : (
          <section className="controls-enter flex flex-1 flex-col gap-10 pt-4">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h2 className="font-[Syne] text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Channels
                </h2>
                <p className="mt-2 max-w-md text-sm text-teal-100/60">
                  Dial each spectrum 0–100. Preview updates as you mix.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => bridge.disconnect()}>
                Disconnect
              </Button>
            </div>

            <div
              className="tank-preview"
              style={{
                ["--mix" as string]: mix,
              }}
            >
              <div className="tank-glow" />
              <span className="relative z-10 font-[Figtree] text-xs font-medium tracking-[0.2em] text-white/70 uppercase">
                Live mix
              </span>
            </div>

            <div className="grid grid-cols-2 gap-8 lg:grid-cols-4 lg:gap-6">
              {CHANNEL_META.map((ch) => (
                <ChannelDial
                  key={ch.key}
                  label={ch.label}
                  value={local[ch.key]}
                  accent={ch.accent}
                  onChange={(v) => updateChannel(ch.key, v)}
                />
              ))}
            </div>

            {bridge.error && (
              <p className="text-center text-sm text-rose-200/90">{bridge.error}</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
