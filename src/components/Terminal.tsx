import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import '@xterm/xterm/css/xterm.css';

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [currentLine, setCurrentLine] = useState('');

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
    xterm.write('\r\n$ ');

    // Handle input
    xterm.onData((data) => {
      if (data === '\r') { // Enter key
        if (currentLine.trim()) {
          executeCommand(currentLine);
          setCurrentLine('');
          xterm.write('\r\n$ ');
        }
      } else if (data === '\u0003') { // Ctrl+C
        xterm.write('^C\r\n$ ');
        setCurrentLine('');
      } else if (data === '\u0008') { // Backspace
        if (currentLine.length > 0) {
          setCurrentLine(currentLine.slice(0, -1));
          xterm.write('\b \b');
        }
      } else {
        setCurrentLine(currentLine + data);
        xterm.write(data);
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

  const executeCommand = async (cmd: string) => {
    try {
      const result = await invoke<string>('execute_command', { command: cmd });
      if (xtermRef.current) {
        xtermRef.current.write(result);
        xtermRef.current.write('\r\n');
      }
    } catch (error) {
      if (xtermRef.current) {
        xtermRef.current.writeln(`Error: ${error}`);
      }
    }
  };

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
