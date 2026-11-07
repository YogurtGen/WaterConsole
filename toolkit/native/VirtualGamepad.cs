using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Linq;

internal sealed class VirtualGamepad : IDisposable
{
    [StructLayout(LayoutKind.Sequential)] internal struct Report
    {
        public ushort buttons;
        public byte leftTrigger, rightTrigger;
        public short leftX, leftY, rightX, rightY;
    }
    const uint Success = 0x20000000;
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void MotorNotification(IntPtr client, IntPtr target, byte largeMotor, byte smallMotor, byte led, IntPtr userData);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibraryEx(string file, IntPtr reserved, uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr vigem_alloc();
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern uint vigem_connect(IntPtr client);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern void vigem_disconnect(IntPtr client);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern void vigem_free(IntPtr client);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr vigem_target_x360_alloc();
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern uint vigem_target_add(IntPtr client, IntPtr target);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern uint vigem_target_x360_update(IntPtr client, IntPtr target, Report report);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern uint vigem_target_remove(IntPtr client, IntPtr target);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern void vigem_target_free(IntPtr target);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern uint vigem_target_x360_register_notification(IntPtr client, IntPtr target, MotorNotification notification, IntPtr userData);
    [DllImport("ViGEmClient.dll", CallingConvention = CallingConvention.Cdecl)] static extern void vigem_target_x360_unregister_notification(IntPtr target);
    [StructLayout(LayoutKind.Sequential)] struct XInputState { public uint packet; public Report report; }
    [DllImport("xinput1_4.dll")] static extern uint XInputGetState(uint index, out XInputState state);
    public static HashSet<int> ConnectedIndices()
    {
        var result = new HashSet<int>();
        for (uint index = 0; index < 4; index++) { XInputState state; if (XInputGetState(index, out state) == 0) result.Add((int)index); }
        return result;
    }
    IntPtr module, client, target;
    int userIndex = -1;
    MotorNotification notification;
    bool registered;
    volatile bool acceptFeedback;
    int motors;
    readonly int slot;
    bool connected, disposed;
    Report wanted;
    public bool Available { get; private set; }
    public bool Attached { get { return target != IntPtr.Zero; } }
    public int UserIndex { get { return userIndex; } }
    public string Message { get; private set; }
    public int Held { get; private set; }
    public object Status { get { return new { available = Available, message = Message }; } }

    public VirtualGamepad(int playerSlot = 1)
    {
        slot = playerSlot;
        try
        {
            string file = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ViGEmClient.dll");
            module = LoadLibraryEx(file, IntPtr.Zero, 0x1100);
            if (module == IntPtr.Zero) throw new InvalidOperationException("The local virtual gamepad client could not load.");
            client = vigem_alloc();
            if (client == IntPtr.Zero) throw new InvalidOperationException("The virtual gamepad client could not initialize.");
            uint result = vigem_connect(client);
            if (result != Success)
            {
                Message = "Virtual gamepads require the optional ViGEmBus driver on the PC.";
                return;
            }
            connected = true;
            Available = true;
        }
        catch (Exception error) { Message = "Phone gamepad unavailable: " + error.Message; }
    }
    public bool EnsureTarget()
    {
        if (!Available || disposed) return false;
        if (target != IntPtr.Zero) return true;
        try
        {
            var previousIndices = ConnectedIndices();
            target = vigem_target_x360_alloc();
            if (target == IntPtr.Zero) throw new InvalidOperationException("Windows could not allocate the P" + slot + " virtual controller.");
            uint added = vigem_target_add(client, target);
            if (added != Success)
            {
                string advice = added == 0xE0000007
                    ? "The virtual device did not finish becoming ready. Check its Windows device status before retrying."
                    : added == 0xE0000002
                    ? "No virtual controller slot is free. Close other virtual controller sessions, then retry."
                    : "Check the Windows virtual controller device status before retrying.";
                throw new InvalidOperationException("Windows could not connect P" + slot + " (0x" + added.ToString("X8") + "). " + advice);
            }
            uint neutral = vigem_target_x360_update(client, target, new Report());
            for (int attempt = 0; neutral != Success && attempt < 4; attempt++)
            {
                Thread.Sleep(100);
                neutral = vigem_target_x360_update(client, target, new Report());
            }
            if (neutral != Success) throw new InvalidOperationException("P" + slot + " controller did not become ready (0x" + neutral.ToString("X8") + ").");
            // The archived SDK can report index 0 for every device. Observe the
            // single new XInput arrival while creating targets sequentially instead.
            for (int attempt = 0; attempt < 24; attempt++)
            {
                var arrived = ConnectedIndices().Except(previousIndices).ToArray();
                if (arrived.Length > 1) throw new InvalidOperationException("Other controllers connected during P" + slot + " setup. Retry with a stable device list.");
                if (arrived.Length == 1) { userIndex = arrived[0]; break; }
                Thread.Sleep(75);
            }
            if (userIndex < 0) throw new InvalidOperationException("No new XInput player slot appeared for P" + slot + ". Disconnect other controllers, then retry.");
            notification = ReceiveMotors;
            acceptFeedback = true;
            uint registeredResult = vigem_target_x360_register_notification(client, target, notification, IntPtr.Zero);
            if (registeredResult != Success)
                throw new InvalidOperationException("Windows could not register P" + slot + " controller feedback (0x" + registeredResult.ToString("X8") + ").");
            registered = true;
            Submit(new Report());
            return Available;
        }
        catch (Exception error) { Fail(error.Message); return false; }
    }
    public static readonly HashSet<string> Actions = new HashSet<string>(new [] { "up", "down", "left", "right", "a", "b", "x", "y", "l", "r", "lt", "rt", "start", "select", "confirm", "back" });
    public static Report Map(IList<string> buttons, string mode, string profile = "standard")
    {
        if (profile != "standard" || (mode != "menu" && mode != "game")) throw new InvalidOperationException("Unknown controller profile or mode.");
        var pressed = new HashSet<string>(buttons);
        if (pressed.Any(action => !Actions.Contains(action))) throw new InvalidOperationException("Unknown semantic action.");
        Report report = new Report();
        int x = (pressed.Contains("right") ? 1 : 0) - (pressed.Contains("left") ? 1 : 0);
        int y = (pressed.Contains("up") ? 1 : 0) - (pressed.Contains("down") ? 1 : 0);
        if (mode == "menu") {
            if (y > 0) report.buttons |= 0x0001;
            if (y < 0) report.buttons |= 0x0002;
            if (x < 0) report.buttons |= 0x0004;
            if (x > 0) report.buttons |= 0x0008;
        } else { report.leftX = (short)(x * 32767); report.leftY = (short)(y * 32767); }
        if (pressed.Contains("a") || pressed.Contains("confirm")) report.buttons |= 0x1000;
        if (pressed.Contains("b") || pressed.Contains("back")) report.buttons |= 0x2000;
        if (pressed.Contains("x")) report.buttons |= 0x4000;
        if (pressed.Contains("y")) report.buttons |= 0x8000;
        if (pressed.Contains("l")) report.buttons |= 0x0100;
        if (pressed.Contains("r")) report.buttons |= 0x0200;
        if (pressed.Contains("lt")) report.leftTrigger = 255;
        if (pressed.Contains("rt")) report.rightTrigger = 255;
        if (pressed.Contains("start")) report.buttons |= 0x0010;
        if (pressed.Contains("select")) report.buttons |= 0x0020;
        return report;
    }
    public void Want(IList<string> buttons, string mode, string profile = "standard") { wanted = Map(buttons, mode, profile); }
    void Submit(Report report)
    {
        if (!Available || target == IntPtr.Zero) return;
        try
        {
            uint result = vigem_target_x360_update(client, target, report);
            if (result != Success) throw new InvalidOperationException("Windows rejected P" + slot + " controller state (0x" + result.ToString("X8") + ").");
            int count = 0;
            for (int value = report.buttons; value != 0; value &= value - 1) count++;
            Held = count + (report.leftTrigger != 0 ? 1 : 0) + (report.rightTrigger != 0 ? 1 : 0) + (report.leftX != 0 ? 1 : 0) + (report.leftY != 0 ? 1 : 0) + (report.rightX != 0 ? 1 : 0) + (report.rightY != 0 ? 1 : 0);
        }
        catch (Exception error) { Fail(error.Message); }
    }
    // Native callbacks must never acquire the bridge's input lock or write JSON.
    void ReceiveMotors(IntPtr sourceClient, IntPtr sourceTarget, byte largeMotor, byte smallMotor, byte led, IntPtr userData)
    {
        if (acceptFeedback) Interlocked.Exchange(ref motors, largeMotor | (smallMotor << 8));
    }
    public int ReadMotors() { return Interlocked.CompareExchange(ref motors, 0, 0); }
    public void WantReport(Report report) { wanted = report; }
    public void Apply() { Submit(wanted); }
    public void Reset() { wanted = new Report(); Interlocked.Exchange(ref motors, 0); Submit(wanted); }
    void Fail(string error)
    {
        Message = "Phone gamepad unavailable: " + error;
        Available = false;
        wanted = new Report();
        Interlocked.Exchange(ref motors, 0);
        Held = 0;
        RemoveTarget();
    }
    void RemoveTarget()
    {
        acceptFeedback = false;
        Interlocked.Exchange(ref motors, 0);
        if (target == IntPtr.Zero) return;
        try { if (registered) vigem_target_x360_unregister_notification(target); } catch { }
        registered = false;
        try { if (connected) { vigem_target_x360_update(client, target, new Report()); vigem_target_remove(client, target); } } catch { }
        try { vigem_target_free(target); } catch { }
        target = IntPtr.Zero;
        userIndex = -1;
        notification = null;
        Held = 0;
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        wanted = new Report();
        RemoveTarget();
        try { if (connected) vigem_disconnect(client); } catch { }
        connected = false;
        try { if (client != IntPtr.Zero) vigem_free(client); } catch { }
        client = IntPtr.Zero;
        Available = false;
        if (module != IntPtr.Zero) { FreeLibrary(module); module = IntPtr.Zero; }
    }
}
