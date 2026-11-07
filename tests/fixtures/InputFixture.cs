using System;using System.IO;using System.Linq;using System.Runtime.InteropServices;using System.Windows.Forms;using System.Web.Script.Serialization;
class Fixture:Form{
 [StructLayout(LayoutKind.Sequential)]public struct Report{public ushort buttons;public byte lt,rt;public short lx,ly,rx,ry;}
 [StructLayout(LayoutKind.Sequential)]public struct State{public uint packet;public Report report;}
 [DllImport("xinput1_4.dll")]static extern uint XInputGetState(uint index,out State state);
 [StructLayout(LayoutKind.Sequential)]public struct Motors{public ushort left,right;}
 [DllImport("xinput1_4.dll")]static extern uint XInputSetState(uint index,ref Motors motors);
 [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
 string output;JavaScriptSerializer json=new JavaScriptSerializer();Timer timer=new Timer();
 Fixture(string file){output=file;Text="WaterConsole Input Fixture";Width=640;Height=320;StartPosition=FormStartPosition.CenterScreen;Controls.Add(new Label{Dock=DockStyle.Fill,Text="WaterConsole input test fixture\nOwned test application · no game engine",TextAlign=System.Drawing.ContentAlignment.MiddleCenter,Font=new System.Drawing.Font("Segoe UI",18)});timer.Interval=50;timer.Tick+=(s,e)=>Poll();Shown+=(s,e)=>{Activate();timer.Start();};FormClosed+=(s,e)=>{timer.Stop();Poll();};}
 void Poll(){try{if(File.Exists(output+".blur")){File.Delete(output+".blur");WindowState=FormWindowState.Minimized;}var pads=Enumerable.Range(0,4).Select(index=>{State state;uint code=XInputGetState((uint)index,out state);if(code==0){var motors=new Motors{left=(ushort)((state.report.buttons&8192)!=0?65535:0),right=(ushort)((state.report.buttons&8192)!=0?65535:0)};XInputSetState((uint)index,ref motors);}return new{index,connected=code==0,report=state.report};}).ToArray();var keys=new[]{0x57,0x41,0x53,0x44,0x20,0x0d,0x10,0x1b}.Where(k=>(GetAsyncKeyState(k)&0x8000)!=0).ToArray();File.WriteAllText(output,json.Serialize(new{pads,keys,time=DateTime.UtcNow.ToString("o")}));}catch{}}
 [STAThread]static void Main(string[] args){Application.EnableVisualStyles();Application.Run(new Fixture(args[0]));}
}
