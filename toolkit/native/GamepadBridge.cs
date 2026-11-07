using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// This optional developer helper never launches a process or accepts network connections.
internal static class GamepadBridge
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    static readonly object Gate = new object();
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 16384, RecursionLimit = 12 };
    static readonly Stopwatch Clock = Stopwatch.StartNew();
    static VirtualGamepad[] Pads;
    static Process Game;
    static long LastFrame = -1000, Epoch, Sequence = -1;
    static long RateStart;
    static int RateCount;
    static string Mode;
    static bool Active, Closing;
    static readonly int[] Motors = new int[4];
    static long LastOutput;
    static bool? LastFocus;

    static void Emit(object message) { Console.WriteLine(Json.Serialize(message)); }
    static bool Focused() {
        uint pid;
        GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        return Game != null && !Game.HasExited && pid == Game.Id;
    }
    static void Neutral() {
        Active = false;
        if (Pads == null) return;
        for (int i = 0; i < Pads.Length; i++) {
            if (Pads[i] != null) Pads[i].Reset();
            if (Motors[i] != 0) Emit(new { type = "rumble", epoch = Epoch, slot = i + 1, largeMotor = 0, smallMotor = 0, durationMs = 0 });
            Motors[i] = 0;
        }
    }
    static long Integer(object value) {
        if (!(value is int) && !(value is long)) throw new FormatException("Expected integer.");
        long number = Convert.ToInt64(value);
        if (number < 0 || number > 9007199254740991L) throw new FormatException("Integer outside protocol range.");
        return number;
    }
    static object Get(Dictionary<string, object> value, string key) {
        object result;
        if (!value.TryGetValue(key, out result)) throw new FormatException("Missing field.");
        return result;
    }
    static IList<string>[] Parse(string line, int playerCount, out long epoch, out long sequence, out string mode) {
        var frame = Json.DeserializeObject(line) as Dictionary<string, object>;
        if (frame == null || (string)Get(frame, "type") != "state" || Integer(Get(frame, "version")) != 1 || (string)Get(frame, "profile") != "standard") throw new FormatException("Unknown protocol.");
        epoch = Integer(Get(frame, "epoch")); sequence = Integer(Get(frame, "seq")); mode = (string)Get(frame, "mode");
        if (epoch == 0 || (mode != "menu" && mode != "game")) throw new FormatException("Invalid epoch or mode.");
        if (Integer(Get(frame, "playerMax")) != playerCount) throw new FormatException("Player count changed.");
        string display = (string)Get(frame, "displayMode");
        if (display != "shared" && display != "split-2" && display != "split-4") throw new FormatException("Unknown display mode.");
        var entries = Get(frame, "players") as object[];
        if (entries == null || entries.Length > playerCount) throw new FormatException("Invalid players.");
        var result = new IList<string>[playerCount];
        for (int i = 0; i < result.Length; i++) result[i] = new List<string>();
        var slots = new HashSet<int>();
        foreach (var entry in entries) {
            var player = entry as Dictionary<string, object>;
            if (player == null) throw new FormatException("Invalid player.");
            long slotValue = Integer(Get(player, "slot"));
            if (slotValue < 1 || slotValue > playerCount) throw new FormatException("Invalid slot.");
            int slot = (int)slotValue;
            if (!slots.Add(slot)) throw new FormatException("Duplicate slot.");
            var buttons = Get(player, "buttons") as object[];
            if (buttons == null || buttons.Length > 16) throw new FormatException("Invalid buttons.");
            foreach (var button in buttons) {
                var action = button as string;
                if (action == null || !VirtualGamepad.Actions.Contains(action) || result[slot - 1].Contains(action)) throw new FormatException("Invalid semantic action.");
                result[slot - 1].Add(action);
            }
        }
        return result;
    }
    static string ReadBoundedLine() {
        var buffer = new StringBuilder();
        while (true) {
            int value = Console.In.Read();
            if (value < 0) return buffer.Length == 0 ? null : buffer.ToString();
            if (value == '\n') return buffer.ToString().TrimEnd('\r');
            if (buffer.Length >= 16384) throw new FormatException("Frame too large.");
            buffer.Append((char)value);
        }
    }
    static void Tick(object ignored) {
        lock (Gate) {
            if (Closing) return;
            try {
                bool focus = Focused();
                if (!focus || Clock.ElapsedMilliseconds - LastFrame > 300) Neutral();
                else if (Active) foreach (var pad in Pads) pad.Apply();
                if (Pads.Any(pad => !pad.Available)) { Neutral(); Closing = true; Emit(new { type = "error", message = "A virtual controller became unavailable." }); return; }
                if (Clock.ElapsedMilliseconds - LastOutput >= 50) {
                    LastOutput = Clock.ElapsedMilliseconds;
                    for (int i = 0; i < Pads.Length; i++) {
                        int value = focus && Active ? Pads[i].ReadMotors() : 0;
                        if (value != 0 || Motors[i] != value) Emit(new { type = "rumble", epoch = Epoch, slot = i + 1, largeMotor = value & 255, smallMotor = value >> 8, durationMs = value == 0 ? 0 : 100 });
                        Motors[i] = value;
                    }
                }
                if (LastFocus != focus) { LastFocus = focus; Emit(new { type = "focus", focused = focus, epoch = Epoch }); }
            } catch { Neutral(); Closing = true; }
        }
    }
    static int SelfTest() {
        int checks = 0;
        Action<bool> check = value => { if (!value) throw new Exception("Toolkit self-test failed at " + checks); checks++; };
        check(VirtualGamepad.Map(new [] { "left", "right", "up", "down" }, "game").leftX == 0);
        check(VirtualGamepad.Map(new [] { "left", "right", "up", "down" }, "game").leftY == 0);
        check(VirtualGamepad.Map(new [] { "right", "up", "a", "rt" }, "game").leftX == 32767);
        check(VirtualGamepad.Map(new [] { "right", "up", "a", "rt" }, "game").rightTrigger == 255);
        check(VirtualGamepad.Map(new [] { "left" }, "menu").buttons == 4);
        check(VirtualGamepad.Map(new [] { "a", "confirm" }, "game").buttons == 0x1000);
        check(VirtualGamepad.Map(new [] { "b", "back" }, "game").buttons == 0x2000);
        check(VirtualGamepad.Map(new [] { "x", "y", "l", "r", "lt", "start", "select" }, "game").buttons == 0xc330);
        long epoch, seq; string mode;
        string valid = "{\"type\":\"state\",\"version\":1,\"profile\":\"standard\",\"epoch\":1,\"seq\":0,\"mode\":\"game\",\"playerMax\":4,\"displayMode\":\"shared\",\"players\":[{\"slot\":1,\"buttons\":[\"a\"]},{\"slot\":4,\"buttons\":[\"b\"]}]}";
        var result = Parse(valid, 4, out epoch, out seq, out mode);
        check(result[0].Single() == "a" && result[3].Single() == "b" && result[1].Count == 0);
        foreach (var bad in new [] { valid.Replace("\"a\"", "\"shell\""), valid.Replace("\"slot\":4", "\"slot\":1"), valid.Replace("\"slot\":4", "\"slot\":5"), valid.Replace("\"epoch\":1", "\"epoch\":0"), valid.Replace("\"mode\":\"game\"", "\"mode\":\"unknown\""), valid.Replace("\"version\":1", "\"version\":2"), valid.Replace("\"seq\":0", "\"seq\":0.5"), valid.Replace("\"playerMax\":4", "\"playerMax\":3") }) {
            bool rejected = false; try { Parse(bad, 4, out epoch, out seq, out mode); } catch { rejected = true; } check(rejected);
        }
        Emit(new { type = "self-test", checks = checks, nativeDevicesCreated = false });
        return 0;
    }
    static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false);
        try {
            if (args.SequenceEqual(new [] { "--self-test" })) return SelfTest();
            if (args.SequenceEqual(new [] { "--probe" })) {
                using (var probe = new VirtualGamepad()) { Emit(new { type = "probe", available = probe.Available, message = probe.Message, targetsCreated = false }); return probe.Available ? 0 : 2; }
            }
            if (args.Length != 6 || args[0] != "--pid" || args[2] != "--exe" || args[4] != "--players") throw new ArgumentException("Use --probe, --self-test, or --pid PID --exe ABSOLUTE_EXE --players 1..4.");
            int pid, count;
            if (!Int32.TryParse(args[1], out pid) || pid < 1 || !Int32.TryParse(args[5], out count) || count < 1 || count > 4) throw new ArgumentException("Invalid process or player count.");
            if (!Path.IsPathRooted(args[3]) || !String.Equals(Path.GetExtension(args[3]), ".exe", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("A trusted absolute executable is required.");
            string expected = Path.GetFullPath(args[3]);
            Game = Process.GetProcessById(pid);
            if (pid == Process.GetCurrentProcess().Id || !String.Equals(expected, Path.GetFullPath(Game.MainModule.FileName), StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("The process does not match the selected executable.");
            Pads = new VirtualGamepad[count];
            for (int i = 0; i < count; i++) { Pads[i] = new VirtualGamepad(i + 1); if (!Pads[i].EnsureTarget()) throw new InvalidOperationException(Pads[i].Message); }
            Emit(new { type = "ready", slots = Pads.Select((pad, index) => new { slot = index + 1, xinputIndex = pad.UserIndex }).ToArray() });
            using (var timer = new Timer(Tick, null, 0, 15)) {
                string line;
                while ((line = ReadBoundedLine()) != null) {
                    lock (Gate) {
                        if (Closing) break;
                        long now = Clock.ElapsedMilliseconds;
                        if (now - RateStart >= 1000) { RateStart = now; RateCount = 0; }
                        if (++RateCount > 240) throw new FormatException("Input rate exceeded.");
                        long epoch, sequence; string mode;
                        var frame = Parse(line, count, out epoch, out sequence, out mode);
                        if (epoch < Epoch || (epoch == Epoch && sequence <= Sequence)) { Neutral(); continue; }
                        if (epoch != Epoch || mode != Mode) { Neutral(); Epoch = epoch; Sequence = sequence; Mode = mode; LastFrame = now; continue; }
                        Sequence = sequence; LastFrame = now;
                        if (!Focused()) { Neutral(); continue; }
                        for (int i = 0; i < count; i++) Pads[i].Want(frame[i], mode);
                        Active = true;
                    }
                }
            }
            return 0;
        } catch (Exception error) { lock (Gate) { Emit(new { type = "error", message = error is FormatException ? "Invalid input frame; helper stopped." : error.Message }); } return 1; }
        finally { lock (Gate) { Closing = true; Neutral(); if (Pads != null) foreach (var pad in Pads) if (pad != null) pad.Dispose(); if (Game != null) Game.Dispose(); } }
    }
}
