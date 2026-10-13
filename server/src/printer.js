import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Sends raw bytes (ESC/POS) straight to a Windows printer through the print spooler.
// Works with any printer installed in Windows, including XPrinter over USB.
const RAW_PRINT_SCRIPT = `
param([string]$Printer, [string]$DataFile)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KambaRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr handle, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr handle, IntPtr bytes, int count, out int written);

  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("Cannot open printer '" + printer + "' (error " + Marshal.GetLastWin32Error() + ")");
    try {
      var di = new DOCINFO { pDocName = "Kamba Online order slip", pDataType = "RAW" };
      if (StartDocPrinter(h, 1, di) == 0) throw new Exception("StartDocPrinter failed (error " + Marshal.GetLastWin32Error() + ")");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed (error " + Marshal.GetLastWin32Error() + ")");
        IntPtr p = Marshal.AllocCoTaskMem(data.Length);
        try {
          Marshal.Copy(data, 0, p, data.Length);
          int written;
          if (!WritePrinter(h, p, data.Length, out written) || written != data.Length)
            throw new Exception("WritePrinter failed (error " + Marshal.GetLastWin32Error() + ")");
        } finally { Marshal.FreeCoTaskMem(p); }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
[KambaRawPrinter]::Send($Printer, [System.IO.File]::ReadAllBytes($DataFile))
`;

const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
$cim = @(Get-CimInstance Win32_Printer)
$default = ($cim | Where-Object { $_.Default }).Name
$offline = @{}
foreach ($c in $cim) { $offline[$c.Name] = [bool]$c.WorkOffline }
$list = @(Get-Printer | ForEach-Object {
  [pscustomobject]@{ name = $_.Name; driver = $_.DriverName; port = $_.PortName; isDefault = ($_.Name -eq $default); offline = [bool]$offline[$_.Name] }
})
ConvertTo-Json -InputObject $list -Compress
`;

function runPowerShell(scriptText, args = [], timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const file = path.join(os.tmpdir(), `kamba-${crypto.randomBytes(6).toString('hex')}.ps1`);
    fs.writeFileSync(file, `\uFEFF${scriptText}`, 'utf8'); // BOM so PowerShell reads accents correctly
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args],
      { windowsHide: true }
    );
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('The printer did not answer in time.'));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      fs.rmSync(file, { force: true });
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.rmSync(file, { force: true });
      if (code === 0) resolve(stdout);
      else reject(new Error((stderr || stdout || `PowerShell exited with ${code}`).trim().split('\n')[0]));
    });
  });
}

/** The real printer, used by the app. Tests pass a fake with the same two methods. */
export const windowsPrinter = {
  supported: process.platform === 'win32',

  async list() {
    if (!this.supported) return [];
    const out = (await runPowerShell(LIST_SCRIPT)).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  },

  async printRaw(printerName, buffer) {
    if (!this.supported) throw new Error('Printing needs Windows.');
    const data = path.join(os.tmpdir(), `kamba-slip-${crypto.randomBytes(6).toString('hex')}.bin`);
    fs.writeFileSync(data, buffer);
    try {
      await runPowerShell(RAW_PRINT_SCRIPT, ['-Printer', printerName, '-DataFile', data], 45_000);
    } finally {
      fs.rmSync(data, { force: true });
    }
  },
};
