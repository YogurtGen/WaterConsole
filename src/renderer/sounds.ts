export type ConsoleCue = "move" | "confirm";

function scheduleCue(
  context: BaseAudioContext,
  output: AudioNode,
  cue: ConsoleCue,
) {
  const start = context.currentTime;
  const notes =
    cue === "move"
      ? [{ at: 0, hz: 880, duration: 0.045, level: 0.12 }]
      : [
          { at: 0, hz: 660, duration: 0.085, level: 0.12 },
          { at: 0.035, hz: 990, duration: 0.105, level: 0.1 },
        ];
  for (const note of notes) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.hz, start + note.at);
    envelope.gain.setValueAtTime(0, start + note.at);
    envelope.gain.linearRampToValueAtTime(note.level, start + note.at + 0.003);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      start + note.at + note.duration,
    );
    oscillator.connect(envelope).connect(output);
    oscillator.start(start + note.at);
    oscillator.stop(start + note.at + note.duration + 0.005);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
}

export class ConsoleSounds {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private muted = false;
  setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    if (this.context && this.output) {
      this.output.gain.cancelAndHoldAtTime(this.context.currentTime);
      this.output.gain.setTargetAtTime(
        muted ? 0 : 0.65,
        this.context.currentTime,
        0.005,
      );
    }
  }
  play(cue: ConsoleCue) {
    if (this.muted) return;
    try {
      if (!this.context) {
        this.context = new AudioContext({ latencyHint: "interactive" });
        this.output = this.context.createGain();
        this.output.gain.value = 0.65;
        this.output.connect(this.context.destination);
      }
      const context = this.context,
        output = this.output!;
      const requested = performance.now();
      const play = () => {
        if (
          !this.muted &&
          context.state === "running" &&
          performance.now() - requested < 150
        )
          scheduleCue(context, output, cue);
      };
      if (context.state === "running") play();
      else
        void context
          .resume()
          .then(play)
          .catch(() => {});
    } catch {
      /* Audio device failure must not interrupt console navigation. */
    }
  }
  dispose() {
    void this.context?.close().catch(() => {});
    this.context = null;
    this.output = null;
  }
}
