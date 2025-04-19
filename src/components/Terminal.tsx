import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import '@xterm/xterm/css/xterm.css';

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const commandRef = useRef<string>('');

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff',
      },
    });

    // Initialize addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    // Open terminal in the container
    xterm.open(terminalRef.current);
    fitAddon.fit();

    // Store references
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Write welcome message
    xterm.writeln('Welcome to Taurminal! 🚀');
    xterm.write('$ ');

    const executeCommand = async (cmd: string) => {
      try {
        const result = await invoke<string>('execute_command', { command: cmd });
        xterm.write(result);
        xterm.write('\r\n$ ');
      } catch (error) {
        xterm.writeln(`Error: ${error}`);
        xterm.write('$ ');
      }
    };

    // Handle input
    xterm.onData((data) => {
      switch (data) {
        case '\r': // Enter
          if (commandRef.current.trim()) {
            xterm.write('\r\n');
            const command = commandRef.current;
            commandRef.current = '';
            executeCommand(command);
          } else {
            xterm.write('\r\n$ ');
          }
          break;
        case '\u0003': // Ctrl+C
          xterm.write('^C\r\n$ ');
          commandRef.current = '';
          break;
        case '\u007F': // Backspace (DEL)
        case '\b': // Backspace (BS)
          if (commandRef.current.length > 0) {
            commandRef.current = commandRef.current.slice(0, -1);
            xterm.write('\b \b');
          }
          break;
        default:
          // Only handle printable characters
          if (data >= ' ' && data <= '~') {
            commandRef.current += data;
            xterm.write(data);
          }
          break;
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      style={{
        width: '100%',
        height: '100vh',
        padding: '10px',
        backgroundColor: '#1e1e1e',
      }}
    />
  );
}
