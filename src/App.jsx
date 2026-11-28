import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import localforage from 'localforage';
import JSZip from 'jszip';
import LZString from 'lz-string';
import {
  FiCode, FiSave, FiFolder, FiMenu, FiPlus, FiUpload,
  FiX, FiPlay, FiSettings, FiCheckCircle, FiAlertCircle,
  FiDelete, FiCornerDownLeft, FiChevronsLeft, FiChevronsRight,
  FiSun, FiMoon, FiSearch, FiDownloadCloud, FiCopy, FiScissors,
  FiClipboard, FiTerminal, FiEdit2, FiAlignLeft, FiLink,
  FiWifiOff, FiShare2, FiClock, FiCommand, FiCheck, FiMaximize2,
  FiMinimize2, FiMonitor, FiSmartphone, FiTablet,
  FiZap, FiFileText, FiTrash2, FiMoreVertical, FiInfo,
  FiType, FiMinus, FiPlusCircle
} from 'react-icons/fi';
import './App.css';

const FONT_MIN = 12;
const FONT_MAX = 24;
const DEFAULT_FONT = 14;

const THEME_OPTIONS = [
  { id: 'tech-dark', label: 'Tech Dark', light: false },
  { id: 'midnight-luxe', label: 'Midnight Luxe', light: false },
  { id: 'vs-light', label: 'Light', light: true },
  { id: 'pearl-ivory', label: 'Pearl Ivory', light: true },
];

// ---------- Java কাস্টম Monarch টোকেনাইজার ----------
// প্রতিটি টোকেন ধরন আলাদা নাম পায়, যাতে থিমে আলাদা রং দেওয়া যায়:
//   keyword.package   -> package, import
//   keyword.modifier  -> public, private, static, final ...
//   keyword.control   -> if, else, for, while, return, try ...
//   keyword           -> class, interface, new, this, void ...
//   type.primitive    -> int, boolean, double ...
//   type.identifier   -> String, ArrayList (বড় হাতের অক্ষরে শুরু)
//   function          -> printData( এর মতো মেথড নাম
//   annotation        -> @Override
//   constant          -> true, false, null
const JAVA_MONARCH = {
  defaultToken: '',
  tokenPostfix: '.java',
  packageKw: ['package', 'import'],
  modifiers: ['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'volatile', 'transient', 'native', 'strictfp', 'sealed', 'non-sealed', 'permits', 'default'],
  controlKw: ['if', 'else', 'switch', 'case', 'for', 'while', 'do', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'throws', 'yield', 'when', 'assert'],
  declKw: ['class', 'interface', 'enum', 'record', 'extends', 'implements', 'new', 'this', 'super', 'instanceof', 'void', 'var'],
  primitives: ['boolean', 'byte', 'char', 'double', 'float', 'int', 'long', 'short'],
  constants: ['true', 'false', 'null'],
  tokenizer: {
    root: [
      // মেথড কল/ডিক্লারেশন (নাম + '('): আগে কীওয়ার্ড কিনা দেখে নেয়
      [/[a-z_$][\w$]*(?=\s*\()/, {
        cases: {
          '@controlKw': 'keyword.control',
          '@modifiers': 'keyword.modifier',
          '@declKw': 'keyword',
          '@default': 'function',
        },
      }],
      // বড় হাতের অক্ষরে শুরু = ক্লাস/টাইপ
      [/[A-Z][\w$]*/, 'type.identifier'],
      // সাধারণ লোয়ারকেস শব্দ: কীওয়ার্ড হলে ক্যাটাগরি, নাহলে ভেরিয়েবল
      [/[a-z_$][\w$]*/, {
        cases: {
          '@packageKw': 'keyword.package',
          '@modifiers': 'keyword.modifier',
          '@controlKw': 'keyword.control',
          '@declKw': 'keyword',
          '@primitives': 'type.primitive',
          '@constants': 'constant',
          '@default': 'identifier',
        },
      }],
      [/@[a-zA-Z_$][\w$]*/, 'annotation'],
      [/\/\*\*/, 'comment.doc', '@javadoc'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
      [/"""/, 'string', '@textblock'],
      [/"/, 'string', '@string'],
      [/'(\\.|[^'\\])'/, 'string'],
      [/0[xX][0-9a-fA-F_]+[lL]?/, 'number.hex'],
      [/\d*\.\d+([eE][-+]?\d+)?[fFdD]?/, 'number.float'],
      [/\d+[lLfFdD]?/, 'number'],
      [/[{}()\[\]]/, 'delimiter.bracket'],
      [/[;,.]/, 'delimiter'],
      [/[+\-*\/%&|^!<>=?:~]+/, 'operator'],
      [/\s+/, 'white'],
    ],
    string: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
    textblock: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"""/, 'string', '@pop'],
      [/"/, 'string'],
    ],
    comment: [
      [/[^\/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment'],
    ],
    javadoc: [
      [/[^\/*]+/, 'comment.doc'],
      [/\*\//, 'comment.doc', '@pop'],
      [/[\/*]/, 'comment.doc'],
    ],
  },
};

// Monaco-র ডিফল্ট Java টোকেনাইজার বদলে কাস্টমটি বসানো
const registerJavaLanguage = (monaco) => {
  monaco.languages.setMonarchTokensProvider('java', JAVA_MONARCH);
};

// প্রতিটি টোকেন ধরনের জন্য রং (থিম অনুযায়ী)
const makeRules = (p) => [
  { token: '', foreground: p.text },
  { token: 'comment', foreground: p.comment, fontStyle: 'italic' },
  { token: 'comment.doc', foreground: p.comment, fontStyle: 'italic' },
  { token: 'keyword.package', foreground: p.pkg, fontStyle: 'bold' },
  { token: 'keyword.modifier', foreground: p.modifier },
  { token: 'keyword.control', foreground: p.control },
  { token: 'keyword', foreground: p.klass },
  { token: 'type.primitive', foreground: p.datatype },
  { token: 'type.identifier', foreground: p.klass },
  { token: 'function', foreground: p.method },
  { token: 'annotation', foreground: p.annotation },
  { token: 'string', foreground: p.string },
  { token: 'string.escape', foreground: p.number },
  { token: 'number', foreground: p.number },
  { token: 'number.float', foreground: p.number },
  { token: 'number.hex', foreground: p.number },
  { token: 'constant', foreground: p.number },
  { token: 'identifier', foreground: p.text },
  { token: 'delimiter', foreground: p.text },
  { token: 'delimiter.bracket', foreground: p.text },
  { token: 'operator', foreground: p.text },
  { token: 'tag', foreground: p.control },
  { token: 'attribute.name', foreground: p.klass },
  { token: 'attribute.value', foreground: p.string },
];

const PREMIUM_THEMES = {
  'midnight-luxe': {
    base: 'vs-dark',
    rules: makeRules({
      text: 'C0CAF5', comment: '565F89', pkg: '7DCFFF', klass: '2AC3DE', control: 'BB9AF7',
      modifier: '9ECE6A', datatype: 'FF9E64', method: '7AA2F7', annotation: 'E0AF68',
      string: '9ECE6A', number: 'FF9E64',
    }),
    colors: {
      'editor.background': '#1A1B26',
      'editorGutter.background': '#16161E',
      'editor.foreground': '#C0CAF5',
      'editor.lineHighlightBackground': '#24283B',
      'editor.lineHighlightBorder': '#24283B00',
      'editor.selectionBackground': '#364A82',
      'editor.inactiveSelectionBackground': '#2E3C64',
      'editorCursor.foreground': '#C0CAF5',
      'editorLineNumber.foreground': '#3B4261',
      'editorLineNumber.activeForeground': '#7AA2F7',
      'editorIndentGuide.background': '#2A2E42',
      'editorIndentGuide.activeBackground': '#3B4261',
    },
  },
  'pearl-ivory': {
    base: 'vs',
    rules: makeRules({
      text: '2E3440', comment: '7C8593', pkg: '0B6E99', klass: '136F63', control: '7C3AED',
      modifier: 'B42318', datatype: 'B45309', method: '1D4ED8', annotation: 'A16207',
      string: '15803D', number: 'C2410C',
    }),
    colors: {
      'editor.background': '#FAFAF7',
      'editorGutter.background': '#F0EFEA',
      'editor.foreground': '#2E3440',
      'editor.lineHighlightBackground': '#EEF2F8',
      'editor.lineHighlightBorder': '#EEF2F800',
      'editor.selectionBackground': '#D5E3F7',
      'editor.inactiveSelectionBackground': '#E4ECF7',
      'editorCursor.foreground': '#2E3440',
      'editorLineNumber.foreground': '#A3A8B3',
      'editorLineNumber.activeForeground': '#2E3440',
      'editorIndentGuide.background': '#E2E0D8',
      'editorIndentGuide.activeBackground': '#C9C6BA',
    },
  },
};

// কপি/কাট/পেস্টের টোস্ট বার্তা

const getFileIcon = (name) => {
  const n = name.toLowerCase();
  if (n.endsWith('.html') || n.endsWith('.htm')) return '🟧';
  if (n.endsWith('.css')) return '🟦';
  if (n.endsWith('.js') || n.endsWith('.jsx')) return '🟨';
  if (n.endsWith('.ts') || n.endsWith('.tsx')) return '🔷';
  if (n.endsWith('.json')) return '🟩';
  if (n.endsWith('.py')) return '🐍';
  if (n.endsWith('.md')) return '📘';
  if (n.endsWith('.txt')) return '📄';
  return '📄';
};

const getLanguage = (name) => {
  const ext = name.split('.').pop().toLowerCase();
  const langMap = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    py: 'python', java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp',
    php: 'php', rb: 'ruby', go: 'go', rs: 'rust', swift: 'swift',
    kt: 'kotlin', sql: 'sql', sh: 'shell', bash: 'shell', ps1: 'powershell',
    json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', md: 'markdown',
    dockerfile: 'dockerfile', r: 'r', lua: 'lua', dart: 'dart', scala: 'scala',
    pl: 'perl', asm: 'assembly', bat: 'bat', graphql: 'graphql', vue: 'html',
    svelte: 'html', txt: 'plaintext'
  };
  return langMap[ext] || 'plaintext';
};

const logColor = (level) => {
  switch (level) {
    case 'error': return '#F85149';
    case 'warn': return '#D29922';
    case 'info': return '#58A6FF';
    default: return '#3FB950';
  }
};

const escapeHTML = (str) => {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

function App() {
  const [theme, setTheme] = useState('tech-dark');
  const [fontSize, setFontSize] = useState(DEFAULT_FONT);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [recentCommands, setRecentCommands] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState('name');
  const [searchResults, setSearchResults] = useState([]);
  const [savedFilesMap, setSavedFilesMap] = useState({});
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [showUnsavedDot, setShowUnsavedDot] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [selectionInfo, setSelectionInfo] = useState({ count: 0 });
  const [zenMode, setZenMode] = useState(false);
  const [previewDevice, setPreviewDevice] = useState('mobile');
  const [logFilter, setLogFilter] = useState('all');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [draggedFileId, setDraggedFileId] = useState(null);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const fileHandlesMap = useRef({});

  const [alertConfig, setAlertConfig] = useState({ visible: false, type: 'success', title: '', message: '', isPrompt: false, inputValue: '', onConfirm: null });
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, hasSelection: false, fileId: null, selectionText: '' });

  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const saveTimerRef = useRef(null);
  const searchTimerRef = useRef(null);
  const savedIndicatorTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const selectionModeRef = useRef(false);
  const selectionAnchorRef = useRef(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 1400);
  };

  const showCustomAlert = useCallback((type, title, message, isPrompt = false, onConfirm = null, defaultValue = '') => {
    setAlertConfig({ visible: true, type, title, message, isPrompt, inputValue: defaultValue, onConfirm });
  }, []);
  
  const closeAlert = useCallback(() => setAlertConfig(prev => ({ ...prev, visible: false })), []);
  const activeFile = files.find(f => f.id === activeFileId);
  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const flashSaved = () => { setJustSaved(true); if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current); savedIndicatorTimerRef.current = setTimeout(() => setJustSaved(false), 1500); };
  const keepFocus = () => { if (editorRef.current) editorRef.current.focus(); };

  const handleCodeChange = useCallback((newCode) => {
    setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: newCode ?? '' } : f));
  }, [activeFileId]);

  const handleCreateNewFile = useCallback(() => {
    showCustomAlert('info', 'New File', 'Enter file name (e.g. script.py):', true, (fileName) => {
      if (!fileName) return;
      const newFile = { id: Date.now().toString(), name: fileName, language: getLanguage(fileName), content: '' };
      setFiles(prev => [...prev, newFile]);
      setActiveFileId(newFile.id);
      setSidebarOpen(false);
    });
  }, [showCustomAlert]);

  const handleFormat = useCallback(async () => {
    if (!activeFile) return;
    try {
      const prettier = await import('prettier/standalone');
      let parser = 'babel';
      let plugins = [await import('prettier/plugins/babel'), await import('prettier/plugins/estree')];
      const lang = activeFile.language;
      if (lang === 'html') { parser = 'html'; plugins = [await import('prettier/plugins/html')]; }
      else if (lang === 'css') { parser = 'css'; plugins = [await import('prettier/plugins/postcss')]; }
      else if (lang === 'json') { parser = 'json'; plugins = [await import('prettier/plugins/babel'), await import('prettier/plugins/estree')]; }
      else if (lang === 'markdown') { parser = 'markdown'; plugins = [await import('prettier/plugins/babel'), await import('prettier/plugins/estree')]; }
      else if (lang === 'xml') { showCustomAlert('info', 'Formatting', 'XML auto-formatting is not supported yet.'); return; }
      else if (!['javascript', 'typescript'].includes(lang)) { showCustomAlert('info', 'Formatting', 'Auto-formatting is best supported for HTML, CSS, JS, JSON.'); return; }
      const formatted = await prettier.format(activeFile.content, { parser, plugins, tabWidth: 4, singleQuote: true, semi: true });
      handleCodeChange(formatted);
      showCustomAlert('success', 'Formatted!', `${activeFile.name} formatted successfully.`);
    } catch (err) {
      showCustomAlert('danger', 'Format Failed', err.message || 'Check syntax errors.');
    }
  }, [activeFile, handleCodeChange, showCustomAlert]);

  const handleSaveToPhone = useCallback(async () => {
    if (!activeFile) return;
    
    try {
      if (fileHandlesMap.current[activeFile.id]) {
        const fileHandle = fileHandlesMap.current[activeFile.id];
        const writable = await fileHandle.createWritable();
        await writable.write(activeFile.content);
        await writable.close();
        showCustomAlert('success', 'Saved!', 'File updated successfully.');
        flashSaved();
        return;
      }

      if ('showSaveFilePicker' in window && window.isSecureContext) {
        const ext = activeFile.name.split('.').pop().toLowerCase();
        let mimeType = 'text/plain';
        if (ext === 'html' || ext === 'htm') mimeType = 'text/html';
        else if (ext === 'css') mimeType = 'text/css';
        else if (ext === 'js' || ext === 'jsx') mimeType = 'application/javascript';
        else if (ext === 'json') mimeType = 'application/json';
        
        try {
          const fileHandle = await window.showSaveFilePicker({ 
            suggestedName: activeFile.name, 
            types: [{ description: 'Code Files', accept: { [mimeType]: ['.' + ext] } }] 
          });
          fileHandlesMap.current[activeFile.id] = fileHandle;
          
          const writable = await fileHandle.createWritable();
          await writable.write(activeFile.content);
          await writable.close();
          showCustomAlert('success', 'Saved!', 'File saved to storage.');
          flashSaved();
          return;
        } catch (err) { 
          if (err.name === 'AbortError') return; 
        }
      }

      const base64Content = btoa(unescape(encodeURIComponent(activeFile.content)));
      const dataUri = `data:application/octet-stream;base64,${base64Content}`;
      const a = document.createElement('a');
      a.href = dataUri; a.download = activeFile.name; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); }, 100);
      showCustomAlert('success', 'Downloaded!', `${activeFile.name} saved.`);
      flashSaved();

    } catch (error) {
      showCustomAlert('danger', 'Save Failed', 'Could not save file.');
    }
  }, [activeFile, showCustomAlert]);

  // সেটিংস লোড এবং সেভ
  useEffect(() => {
    const loadSettings = async () => {
      const savedTheme = await localforage.getItem('techSystemTheme');
      const savedFontSize = await localforage.getItem('techSystemFontSize');
      if (savedTheme) setTheme(savedTheme);
      if (savedFontSize) setFontSize(Number(savedFontSize));
    };
    loadSettings();
  }, []);

  useEffect(() => { localforage.setItem('techSystemTheme', theme); }, [theme]);
  useEffect(() => { localforage.setItem('techSystemFontSize', fontSize); }, [fontSize]);

  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const load = async () => {
      const savedFiles = await localforage.getItem('techSystemFiles');
      if (savedFiles && savedFiles.length > 0) {
        setFiles(savedFiles); setActiveFileId(savedFiles[0].id);
        const map = {}; savedFiles.forEach(f => map[f.id] = f.content); setSavedFilesMap(map);
      } else {
        const defaults = [
          { id: '1', name: 'index.html', language: 'html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>My App</title>\n</head>\n<body>\n  <h1 style="color: #58A6FF;">Hello CodeX!</h1>\n  <button onclick="testLog()">Click Me</button>\n</body>\n</html>' },
          { id: '2', name: 'style.css', language: 'css', content: 'body {\n    background: #0D1117;\n    color: #C9D1D9;\n    font-family: "Inter", sans-serif;\n    padding: 20px;\n}' },
          { id: '3', name: 'app.js', language: 'javascript', content: 'console.log("App Running...");\n\nfunction testLog() {\n    console.log("Button clicked at: " + new Date().toLocaleTimeString());\n}' }
        ];
        setFiles(defaults); setActiveFileId('1');
        const map = {}; defaults.forEach(f => map[f.id] = f.content); setSavedFilesMap(map);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (files.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await localforage.setItem('techSystemFiles', files).catch(() => {});
      const map = {}; files.forEach(f => map[f.id] = f.content);
      setSavedFilesMap(map); setLastSaveTime(Date.now()); setShowUnsavedDot(false);
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [files]);

  useEffect(() => {
    if (!activeFile) { setShowUnsavedDot(false); return; }
    setShowUnsavedDot(savedFilesMap[activeFile.id] !== activeFile.content);
  }, [files, activeFile, savedFilesMap]);

  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 's') { e.preventDefault(); handleSaveToPhone(); }
      else if (mod && e.key === 'Enter') { e.preventDefault(); setShowPreview(p => !p); setConsoleLogs([]); }
      else if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); setShowCommandPalette(p => !p); }
      else if (mod && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); handleFormat(); }
      else if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')) { e.preventDefault(); handleCreateNewFile(); }
      else if (mod && e.key === '/') { e.preventDefault(); setShowShortcuts(s => !s); }
      else if (e.key === 'Escape') { setShowShortcuts(false); setShowCommandPalette(false); setContextMenu(c => ({ ...c, visible: false })); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveToPhone, handleFormat, handleCreateNewFile]); 

  const handleExportZip = async () => {
    const zip = new JSZip(); files.forEach(f => zip.file(f.name, f.content));
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content); const a = document.createElement('a');
    a.href = url; a.download = 'codex-project.zip'; a.click();
    URL.revokeObjectURL(url); showCustomAlert('success', 'Exported!', 'Project exported as ZIP archive.');
  };

  const handleShareUrl = () => {
    if (!activeFile) return;
    try {
      const compressed = LZString.compressToEncodedURIComponent(activeFile.content);
      const url = `${window.location.origin}${window.location.pathname}#code=${compressed}`;
      navigator.clipboard.writeText(url).then(() => showCustomAlert('success', 'Link Copied!', 'Share this URL to load the code.'))
      .catch(() => showCustomAlert('info', 'Share URL', url));
    } catch { showCustomAlert('danger', 'Share Failed', 'Could not generate share link.'); }
  };

  const handleRenameFile = useCallback((id) => {
    const file = files.find(f => f.id === id);
    if (!file) return;
    showCustomAlert('info', 'Rename File', 'Enter new file name:', true, (newName) => {
      if (!newName || newName === file.name) return;
      setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName, language: getLanguage(newName) } : f));
    }, file.name);
    setContextMenu(c => ({ ...c, visible: false }));
  }, [files, showCustomAlert]);

  const handleDeleteFile = (id, e) => {
    e?.stopPropagation();
    showCustomAlert('danger', 'Close File', 'Are you sure? Unsaved changes will be lost.', false, () => {
      const newFiles = files.filter(f => f.id !== id);
      setFiles(newFiles);
      if (newFiles.length > 0) setActiveFileId(newFiles[0].id); else setActiveFileId(null);
      delete fileHandlesMap.current[id];
    });
  };

  const handleImportFromUrl = () => {
    showCustomAlert('info', 'Import from URL', 'Enter file URL:', true, async (url) => {
      if (!url) return;
      try {
        const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text(); const fileName = url.split('/').pop().split('?')[0] || 'imported.txt';
        const newFile = { id: Date.now().toString(), name: fileName, language: getLanguage(fileName), content: text };
        setFiles(prev => [...prev, newFile]); setActiveFileId(newFile.id); setSidebarOpen(false);
        showCustomAlert('success', 'Imported!', `${fileName} loaded from URL.`);
      } catch (err) { showCustomAlert('danger', 'Import Failed', err.message); }
    });
  };

  const getSelectedText = () => {
    const ed = editorRef.current; if (!ed) return '';
    const sel = ed.getSelection(); const model = ed.getModel();
    return sel && !sel.isEmpty() && model ? model.getValueInRange(sel) : '';
  };

  const handleCut = async () => {
    if (getSelectedText()) {
      try {
        await navigator.clipboard.writeText(getSelectedText());
        if (editorRef.current) editorRef.current.executeEdits('', [{ range: editorRef.current.getSelection(), text: '' }]);
        showToast('কাট হয়েছে ✓');
      } catch { showCustomAlert('danger', 'Cut failed', 'Clipboard denied.'); }
    }
    setContextMenu(c => ({ ...c, visible: false }));
  };

  const handleCopy = async () => {
    if (getSelectedText()) {
      try { await navigator.clipboard.writeText(getSelectedText()); showToast('কপি হয়েছে ✓'); }
      catch { showCustomAlert('danger', 'Copy failed', 'Clipboard denied.'); }
    }
    setContextMenu(c => ({ ...c, visible: false }));
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (editorRef.current) editorRef.current.executeEdits('', [{ range: editorRef.current.getSelection(), text }]);
      showToast('পেস্ট হয়েছে ✓');
    } catch { showCustomAlert('danger', 'Paste Failed', 'Allow clipboard access.'); }
    setContextMenu(c => ({ ...c, visible: false }));
  };

  const handleSelectAll = () => {
    if (editorRef.current) editorRef.current.setSelection(editorRef.current.getModel().getFullModelRange());
    setContextMenu(c => ({ ...c, visible: false }));
  };

  const handleDeleteSelection = () => {
    if (editorRef.current) editorRef.current.executeEdits('', [{ range: editorRef.current.getSelection(), text: '' }]);
    setContextMenu(c => ({ ...c, visible: false }));
  };

  const safeRange = (sl, sc, el, ec) => {
    if (monacoRef.current?.Range) return new monacoRef.current.Range(sl, sc, el, ec);
    return { startLineNumber: sl, startColumn: sc, endLineNumber: el, endColumn: ec };
  };

  const handleMobileTab = () => {
    if (!editorRef.current) return;
    const selection = editorRef.current.getSelection(); const model = editorRef.current.getModel();
    if (!model) return;
    if (selection && !selection.isEmpty()) {
      const edits = [];
      for (let i = selection.startLineNumber; i <= selection.endLineNumber; i++) edits.push({ range: safeRange(i, 1, i, 1), text: '    ', forceMoveMarkers: true });
      editorRef.current.executeEdits('', edits);
    } else editorRef.current.executeEdits('', [{ range: selection, text: '    ', forceMoveMarkers: true }]);
    keepFocus();
  };

  const handleMobileEnter = () => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel(); const position = editorRef.current.getPosition();
    if (!model || !position) return;
    const lineContent = model.getLineContent(position.lineNumber);
    const textBeforeCursor = lineContent.substring(0, position.column - 1);
    const match = textBeforeCursor.match(/^(\s*)/);
    const indentation = match ? match[0] : '';
    editorRef.current.executeEdits('', [{ range: editorRef.current.getSelection(), text: '\n' + indentation, forceMoveMarkers: true }]);
    keepFocus();
  };

  const handleMobileDelete = () => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel(); if (!model) return;
    const selection = editorRef.current.getSelection(); const position = editorRef.current.getPosition();
    if (!position) return;
    if (selection && !selection.isEmpty()) { editorRef.current.executeEdits('', [{ range: selection, text: '' }]); keepFocus(); return; }
    const lineContent = model.getLineContent(position.lineNumber);
    if (lineContent.trim() === '' && position.lineNumber > 1) {
      const prevLineLength = model.getLineMaxColumn(position.lineNumber - 1);
      editorRef.current.executeEdits('', [{ range: safeRange(position.lineNumber - 1, prevLineLength, position.lineNumber, 1), text: '' }]);
      editorRef.current.setPosition({ lineNumber: position.lineNumber - 1, column: prevLineLength });
    } else if (position.column > 1) {
      editorRef.current.executeEdits('', [{ range: safeRange(position.lineNumber, position.column - 1, position.lineNumber, position.column), text: '' }]);
      editorRef.current.setPosition({ lineNumber: position.lineNumber, column: position.column - 1 });
    } else if (position.lineNumber > 1) {
      const prevLineLength = model.getLineMaxColumn(position.lineNumber - 1);
      editorRef.current.executeEdits('', [{ range: safeRange(position.lineNumber - 1, prevLineLength, position.lineNumber, 1), text: '' }]);
      editorRef.current.setPosition({ lineNumber: position.lineNumber - 1, column: prevLineLength });
    }
    keepFocus();
  };

  const insertSnippet = (text) => {
    if (!editorRef.current) return;
    editorRef.current.executeEdits('', [{ range: editorRef.current.getSelection(), text, forceMoveMarkers: true }]);
    keepFocus();
  };

  const handleBeforeMount = (monaco) => {
    registerJavaLanguage(monaco);
    Object.entries(PREMIUM_THEMES).forEach(([name, t]) => {
      monaco.editor.defineTheme(name, { base: t.base, inherit: true, rules: t.rules, colors: t.colors });
    });
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor; 
    monacoRef.current = monaco;
    
    monaco.editor.defineTheme('tech-dark', {
  base: 'vs-dark', 
  inherit: true,
  rules: [
    // --- বেস ও কমন ---
    { token: '', foreground: 'D4D4D4' }, // ডিফল্ট টেক্সট (হালকা ধূসর)
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' }, // কমেন্ট (সফট সবুজ)
    { token: 'delimiter', foreground: 'D4D4D4' }, 
    { token: 'operator', foreground: 'D4D4D4' }, // অপারেটর (+, -, =)

    // --- JS / TS / JSX / TSX ---
    { token: 'keyword', foreground: 'C586C0' }, // let, const, if, return (সফট বেগুনি)
    { token: 'keyword.control', foreground: 'C586C0' },
    { token: 'string', foreground: 'CE9178' }, // "Hello" (সফট কমলা)
    { token: 'number', foreground: 'B5CEA8' }, // 123, 3.14 (হালকা সবুজ)
    { token: 'regexp', foreground: 'D16969' }, // রেজেক্স (সফট লাল)
    { token: 'function', foreground: 'DCDCAA' }, // ফাংশন নাম (হালকা হলুদ)
    { token: 'variable', foreground: '9CDCFE' }, // ভেরিয়েবল (আকাশি নীল)
    { token: 'variable.predefined', foreground: '4FC1FF' }, // console, window (উজ্জ্বল নীল)
    { token: 'type', foreground: '4EC9B0' }, // টাইপ (সবুজ-জলীয়)
    { token: 'class', foreground: '4EC9B0' }, // ক্লাস নাম
    { token: 'identifier', foreground: '9CDCFE' },
    { token: 'constant', foreground: '569CD6' }, // true, false, null (নীল)

    // --- HTML / XML / JSX ---
    { token: 'tag', foreground: '569CD6' }, // <div>, <html> (নীল)
    { token: 'metatag', foreground: '569CD6' },
    { token: 'attribute.name', foreground: '9CDCFE' }, // class, id (হালকা নীল)
    { token: 'attribute.value', foreground: 'CE9178' }, // "container" (কমলা)
    { token: 'delimiter.html', foreground: '808080' }, // < > /

    // --- CSS / SCSS ---
    { token: 'tag.css', foreground: 'D7BA7D' }, // body, .class (সোনালী/হলুদ)
    { token: 'attribute.name.css', foreground: '9CDCFE' }, // background (নীল)
    { token: 'attribute.value.css', foreground: 'CE9178' }, // red, auto (কমলা)
    { token: 'attribute.value.number.css', foreground: 'B5CEA8' }, // 10, 20 (সবুজ)
    { token: 'attribute.value.unit.css', foreground: 'B5CEA8' }, // px, rem (সবুজ)
    { token: 'attribute.value.hex.css', foreground: 'CE9178' }, // #ffffff (কমলা)

    // --- Python ---
    { token: 'keyword.python', foreground: 'C586C0' }, // def, import (বেগুনি)
    { token: 'string.python', foreground: 'CE9178' }, 
    { token: 'identifier.python', foreground: '9CDCFE' },
    { token: 'type.identifier.python', foreground: '4EC9B0' }, // str, int (সবুজ)

    // --- SQL ---
    { token: 'keyword.sql', foreground: '569CD6' }, // SELECT, FROM (নীল)
    { token: 'string.sql', foreground: 'CE9178' }, // 'John' (কমলা)
    { token: 'number.sql', foreground: 'B5CEA8' }, // 100 (সবুজ)
    { token: 'operator.sql', foreground: 'D4D4D4' }, 

    // --- PHP ---
    { token: 'metatag.php', foreground: '569CD6' }, // <?php ?>
    { token: 'keyword.php', foreground: 'C586C0' }, // function, echo (বেগুনি)
    { token: 'variable.php', foreground: '9CDCFE' }, // $variable (নীল)
    { token: 'string.php', foreground: 'CE9178' },

    // --- C / C++ ---
    { token: 'keyword.c', foreground: '569CD6' }, // int, void, return (নীল)
    { token: 'keyword.cpp', foreground: '569CD6' }, // class, public (নীল)
    { token: 'type.c', foreground: '4EC9B0' }, // int, float (সবুজ)
    { token: 'type.cpp', foreground: '4EC9B0' }, // string, vector (সবুজ)
    { token: 'string.c', foreground: 'CE9178' },
  ],
  colors: {
    // এডিটরের মেইন ব্যাকগ্রাউন্ড (GitHub/VS Code Dark)
    'editor.background': '#1E1E1E',
    'editor.foreground': '#D4D4D4',
    
    // লাইন নাম্বার
    'editorLineNumber.foreground': '#858585',
    'editorLineNumber.activeForeground': '#C6C6C6',
    
    // কার্সর ও সিলেকশন
    'editorCursor.foreground': '#AEAFAD',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#3A3D41',
    
    // বর্তমান লাইন হাইলাইট
    'editor.lineHighlightBackground': '#2A2D2E',
    'editor.lineHighlightBorder': '#282828',
    
    // ইন্ডেন্ট গাইড (দাগ)
    'editorIndentGuide.background': '#404040',
    'editorIndentGuide.activeBackground': '#707070',
    
    // ব্র্যাকেট ম্যাচিং (বন্ধনী মিলানো)
    'editorBracketMatch.background': '#0064001a',
    'editorBracketMatch.border': '#888888',
  }
});
    
    registerJavaLanguage(monaco);
    editor.onMouseDown((e) => {
      if (!selectionModeRef.current) return;
      const pos = e.target.position; if (!pos) return;
      if (!selectionAnchorRef.current) {
        selectionAnchorRef.current = pos;
        editor.setPosition(pos);
        return;
      }
      const a = selectionAnchorRef.current;
      selectionAnchorRef.current = null;
      editor.setSelection(safeRange(a.lineNumber, a.column, pos.lineNumber, pos.column));
    });

    editor.onDidChangeCursorPosition((e) => setCursorPos({ line: e.position.lineNumber, col: e.position.column }));
    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel(); if (!model) return;
      const sel = e.selection;
      if (sel && !sel.isEmpty()) setSelectionInfo({ count: model.getValueInRange(sel).length }); else setSelectionInfo({ count: 0 });
    });
    
    const openContextMenu = (e, forceSelection = false) => {
      if (e && e.event) e.event.preventDefault();
      const selection = editor.getSelection(); const model = editor.getModel();
      const hasSelection = forceSelection || (selection && !selection.isEmpty());
      const selectedText = hasSelection && model ? model.getValueInRange(selection) : '';
      let x = window.innerWidth / 2; let y = window.innerHeight / 2;
      if (e && e.event && e.event.posx !== undefined) { x = e.event.posx; y = e.event.posy; } 
      setContextMenu({ visible: true, x: Math.max(10, Math.min(x, window.innerWidth - 200)), y: Math.max(10, Math.min(y, window.innerHeight - 260)), hasSelection, fileId: null, selectionText: selectedText });
    };
    editor.onContextMenu((e) => openContextMenu(e, false));
  };

  const getPreviewContent = useCallback(() => {
    const htmlFile = files.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm'));
    const cssFiles = files.filter(f => f.name.endsWith('.css'));
    const jsFiles = files.filter(f => f.name.endsWith('.js') && !f.name.endsWith('.json'));
    let html = htmlFile ? htmlFile.content : '<h1 style="padding:20px;font-family:sans-serif;">No HTML file found</h1>';
    const css = cssFiles.map(f => `<style>${f.content}</style>`).join('');
    const js = jsFiles.map(f => `<script>${f.content}<\/script>`).join('');
    const hasHead = /<\/head>/i.test(html); const hasBody = /<\/body>/i.test(html);
    if (hasHead) html = html.replace(/<\/head>/i, `${css}</head>`); else html = `<head>${css}</head>` + html;
    if (hasBody) html = html.replace(/<\/body>/i, `${js}</body>`); else html = html + js;
    return html;
  }, [files]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'CONSOLE_LOG') setConsoleLogs(prev => [...prev, { level: event.data.level || 'log', message: event.data.message, time: new Date().toLocaleTimeString() }]);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const isLight = THEME_OPTIONS.find(t => t.id === theme)?.light ?? false;
  const toggleSelectMode = () => {
    const next = !selectionModeRef.current;
    selectionModeRef.current = next;
    selectionAnchorRef.current = null;
    setSelectionMode(next);
    keepFocus();
  };

  const selectCurrentLine = () => {
    const ed = editorRef.current; const model = ed?.getModel(); const pos = ed?.getPosition();
    if (!model || !pos) return;
    ed.setSelection(safeRange(pos.lineNumber, 1, pos.lineNumber, model.getLineMaxColumn(pos.lineNumber)));
    keepFocus();
  };

  const clearSelection = () => {
    const ed = editorRef.current; const pos = ed?.getPosition();
    selectionAnchorRef.current = null;
    if (pos) ed.setPosition(pos);
    keepFocus();
  };

  const handleZenToggle = () => setZenMode(z => !z);
  const previewWidth = previewDevice === 'mobile' ? '375px' : previewDevice === 'tablet' ? '768px' : '100%';

  const commands = useMemo(() => [
    { id: 'new', label: 'New File', icon: <FiPlus />, action: handleCreateNewFile },
    { id: 'format', label: 'Format Document', icon: <FiAlignLeft />, action: handleFormat },
    { id: 'save', label: 'Save to Phone', icon: <FiSave />, action: handleSaveToPhone },
    { id: 'export', label: 'Export Project ZIP', icon: <FiDownloadCloud />, action: handleExportZip },
    { id: 'share', label: 'Share via URL', icon: <FiShare2 />, action: handleShareUrl },
    { id: 'theme', label: 'Toggle Theme', icon: <FiSun />, action: () => setTheme(t => t === 'tech-dark' ? 'vs-light' : 'tech-dark') },
  ], [activeFile, handleCreateNewFile, handleFormat, handleSaveToPhone]);

  const filteredCommands = useMemo(() => {
    const q = commandQuery.toLowerCase(); const matched = commands.filter(c => c.label.toLowerCase().includes(q));
    if (!q) {
      const recent = recentCommands.map(id => commands.find(c => c.id === id)).filter(Boolean);
      const others = matched.filter(c => !recent.find(r => r.id === c.id));
      return [...recent, ...others];
    }
    return matched;
  }, [commands, commandQuery, recentCommands]);

  const runCommand = (cmd) => { setShowCommandPalette(false); setCommandQuery(''); setRecentCommands(prev => [cmd.id, ...prev.filter(id => id !== cmd.id)].slice(0, 5)); cmd.action(); };
  const timeAgo = (t) => { if (!t) return 'never'; const diff = Math.floor((Date.now() - t) / 1000); if (diff < 5) return 'just now'; if (diff < 60) return `${diff}s ago`; if (diff < 3600) return `${Math.floor(diff / 60)}m ago`; return `${Math.floor(diff / 3600)}h ago`; };
  const filteredLogs = consoleLogs.filter(l => logFilter === 'all' || l.level === logFilter);

  return (
    <div className={`app-container ${isLight ? 'light-mode' : ''} ${zenMode ? 'zen-mode' : ''}`}>
      
      {!zenMode && (
        <header className="top-bar">
          <div className="logo">
            <button className="icon-btn" onClick={() => setSidebarOpen(!sidebarOpen)}><FiMenu size={22} /></button>
            <div className="logo-brand">
              <FiCode size={20} className="logo-icon" />
              <span>CodeX</span>
            </div>
          </div>
          <div className="actions">
            <button className="icon-btn" onClick={() => setFontSize(s => Math.max(FONT_MIN, s - 1))} title="Decrease Font"><FiMinus size={18} /></button>
            <button className="icon-btn" onClick={() => setFontSize(s => Math.min(FONT_MAX, s + 1))} title="Increase Font"><FiPlusCircle size={18} /></button>
            
            <button className="icon-btn" onClick={() => setTheme(isLight ? 'tech-dark' : 'vs-light')} title="Toggle Theme">
              {isLight ? <FiMoon size={20} /> : <FiSun size={20} />}
            </button>
            
            <button className="icon-btn" onClick={() => { setShowPreview(!showPreview); setConsoleLogs([]); }}><FiPlay size={20} /></button>
            <button className={`icon-btn ${justSaved ? 'saved' : ''}`} onClick={handleSaveToPhone}>{justSaved ? <FiCheck size={20} /> : <FiSave size={20} />}</button>
            <button className="icon-btn" onClick={() => setShowSettings(true)}><FiMoreVertical size={22} /></button>
          </div>
        </header>
      )}

      <main className="main-content">
        {!zenMode && (
          <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
             <div className="sidebar-header"><span>Explorer</span><button onClick={handleCreateNewFile} className="icon-btn"><FiPlus size={18} /></button></div>
             <div className="sidebar-search"><FiSearch size={16} color="#8B949E" /><input type="text" placeholder="Search files..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
             <div className="sidebar-actions">
              <button onClick={() => fileInputRef.current.click()}><FiUpload size={16} /> Open from Device</button>
              <button onClick={handleImportFromUrl}><FiLink size={16} /> Import URL</button>
              <button onClick={handleExportZip}><FiDownloadCloud size={16} /> Export Project ZIP</button>
              <button onClick={handleShareUrl}><FiShare2 size={16} /> Share Code URL</button>
              <input type="file" ref={fileInputRef} onChange={(e) => {
                const file = e.target.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  const newFile = { id: Date.now().toString(), name: file.name, language: getLanguage(file.name), content: event.target.result };
                  setFiles(prev => [...prev, newFile]); setActiveFileId(newFile.id); setSidebarOpen(false);
                  showCustomAlert('success', 'File Opened', `${file.name} loaded!`);
                };
                reader.readAsText(file); e.target.value = null;
              }} style={{ display: 'none' }} accept=".js,.jsx,.ts,.tsx,.html,.css,.json,.py,.md,.txt,.xml" />
            </div>
            <ul className="file-list">
              {filteredFiles.map(file => (
                <li key={file.id} className={`${activeFileId === file.id ? 'active' : ''}`} onClick={() => { setActiveFileId(file.id); setSidebarOpen(false); }}>
                  <span className="file-icon">{getFileIcon(file.name)}</span>
                  <span className="file-name">{file.name}</span>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleRenameFile(file.id); }}><FiEdit2 size={14} /></button>
                  <button className="icon-btn" onClick={(e) => handleDeleteFile(file.id, e)}><FiX size={16} /></button>
                </li>
              ))}
              {filteredFiles.length === 0 && <li className="empty-files">No files found</li>}
            </ul>
          </aside>
        )}
        {sidebarOpen && !zenMode && <div className="overlay" onClick={() => setSidebarOpen(false)}></div>}

        <section className="editor-section">
          {activeFile ? (
            <>
              {!zenMode && (
                <div className="editor-header">
                  <span className="file-icon-small">{getFileIcon(activeFile.name)}</span>
                  <span>{activeFile.name}</span>
                  {showUnsavedDot && <span className="unsaved-dot" title="Unsaved">●</span>}
                  <span className="editor-actions">
                    <button className="icon-btn" onClick={handleFormat}><FiAlignLeft size={16} /></button>
                  </span>
                </div>
              )}
              <div className="editor-wrapper">
                <Editor height="100%" language={activeFile.language} value={activeFile.content} onChange={handleCodeChange} theme={theme} beforeMount={handleBeforeMount} onMount={handleEditorDidMount} options={{
                  fontSize, lineHeight: 1.6, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", minimap: { enabled: false }, wordWrap: 'off', automaticLayout: true, lineNumbers: 'on', formatOnPaste: false, formatOnType: false, autoIndent: 'keep', tabSize: 4, readOnly: false, mouseWheelZoom: true, contextmenu: false, selectOnLineNumbers: true, selectionHighlight: true, cursorBlinking: 'smooth', quickSuggestions: true, suggestOnTriggerCharacters: true, acceptSuggestionOnEnter: 'on', colorDecorators: true, matchBrackets: 'always', autoClosingBrackets: 'languageDefined', autoClosingQuotes: 'languageDefined', scrollBeyondLastLine: false, padding: { top: 8, bottom: 120 }, fixedOverflowWidgets: true, bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true }, renderLineHighlight: 'all', renderWhitespace: 'selection', find: { addExtraSpaceOnTop: false, autoFindInSelection: 'never', seedSearchStringFromSelection: 'always' }, snippetSuggestions: 'inline', tabCompletion: 'on', "semanticHighlighting.enabled": true,
                }} />
              </div>

              {!zenMode && (
                <>
                  <div className="mobile-keyboard-toolbar">
                    <button onClick={() => { editorRef.current?.trigger('keyboard', 'undo'); keepFocus(); }}><FiChevronsLeft /></button>
                    <button onClick={() => { editorRef.current?.trigger('keyboard', 'redo'); keepFocus(); }}><FiChevronsRight /></button>
                    <button onClick={handleMobileTab}>Tab</button>
                    <button onClick={handleMobileEnter}><FiCornerDownLeft /></button>
                    <button onClick={handleMobileDelete} className="delete-btn"><FiDelete /></button>
                  </div>
                  <div className="select-bar">
                    <button className={selectionMode ? 'active' : ''} onClick={toggleSelectMode}>{selectionMode ? 'Selecting…' : 'Select'}</button>
                    <button onClick={selectCurrentLine}>Line</button>
                    <button onClick={handleSelectAll}>All</button>
                    <button onClick={handleCopy} disabled={selectionInfo.count === 0}><FiCopy size={14} /> Copy</button>
                    <button onClick={clearSelection} disabled={selectionInfo.count === 0}>Clear</button>
                  </div>
                  <div className="snippet-bar">
                    {['()', '{}', '[]', '""', "''", ';', '=>', '${}', '/* */', '//', '<>', '</>'].map(s => (
                      <button key={s} onClick={() => insertSnippet(s)}>{s}</button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="empty-state">
              <FiCode size={64} color="#58A6FF" />
              <h2>Welcome to CodeX</h2>
              <p>Premium Web Code Editor</p>
              <button onClick={handleCreateNewFile}><FiPlus size={16} /> Create New File</button>
            </div>
          )}
        </section>

        {showPreview && (
          <div className="preview-panel">
            <div className="preview-header">
              <span>Live Preview</span>
              <div className="preview-controls">
                <div className="device-toggle">
                  <button className={previewDevice === 'mobile' ? 'active' : ''} onClick={() => setPreviewDevice('mobile')}><FiSmartphone size={16} /></button>
                  <button className={previewDevice === 'tablet' ? 'active' : ''} onClick={() => setPreviewDevice('tablet')}><FiTablet size={16} /></button>
                  <button className={previewDevice === 'desktop' ? 'active' : ''} onClick={() => setPreviewDevice('desktop')}><FiMonitor size={16} /></button>
                </div>
                <button className="icon-btn" onClick={() => setShowConsole(!showConsole)}><FiTerminal size={18} /></button>
                <button className="icon-btn" onClick={() => setShowPreview(false)}><FiX size={20} /></button>
              </div>
            </div>
            <div className="preview-body">
              <iframe title="preview" srcDoc={getPreviewContent()} className="preview-iframe" style={{ width: previewWidth, maxWidth: '100%' }} sandbox="allow-scripts allow-modals allow-forms" />
            </div>
            {showConsole && (
              <div className="console-panel">
                <div className="console-header">
                  <span>Console</span>
                  <button className="icon-btn" onClick={() => setConsoleLogs([])}><FiTrash2 size={14} /></button>
                </div>
                <div className="console-output">
                  {filteredLogs.length === 0 ? <span style={{ color: '#8B949E' }}>No logs...</span> : filteredLogs.map((log, i) => (
                    <div key={i} className="log-line" style={{ color: logColor(log.level) }}><span className="log-time">{log.time}</span> {log.message}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {!zenMode && (
        <footer className="status-bar">
          <div>{activeFile?.language?.toUpperCase() || 'TXT'}</div>
          <div>Ln {cursorPos.line}, Col {cursorPos.col}</div>
          <div>{lastSaveTime && `Saved ${timeAgo(lastSaveTime)}`}</div>
        </footer>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings & Menu</h2>
              <button className="icon-btn" onClick={() => setShowSettings(false)}><FiX size={24} /></button>
            </div>
            <div className="modal-body">
              <button className="menu-btn" onClick={() => { setShowCommandPalette(true); setShowSettings(false); }}><FiCommand /> Command Palette</button>
              <button className="menu-btn" onClick={() => { setShowShortcuts(true); setShowSettings(false); }}><FiInfo /> Keyboard Shortcuts</button>
              <div className="theme-picker">
                <label>Theme</label>
                <div className="theme-grid">
                  {THEME_OPTIONS.map(t => (
                    <button key={t.id} className={`theme-chip ${theme === t.id ? 'active' : ''}`} onClick={() => { setTheme(t.id); setShowSettings(false); }}>{t.label}</button>
                  ))}
                </div>
              </div>
              <button className="menu-btn" onClick={() => { handleZenToggle(); setShowSettings(false); }}><FiMaximize2 /> Zen Mode</button>
              <div className="setting-item">
                <label>Font Size: {fontSize}px</label>
                <input type="range" min={FONT_MIN} max={FONT_MAX} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
              </div>
              <button className="menu-btn" onClick={() => { setShowAbout(true); setShowSettings(false); }}><FiInfo /> About CodeX</button>
            </div>
          </div>
        </div>
      )}

      {showCommandPalette && (
        <div className="modal-overlay" onClick={() => setShowCommandPalette(false)}>
          <div className="command-palette" onClick={e => e.stopPropagation()}>
            <div className="cp-input-wrap">
              <FiSearch size={18} color="#8B949E" />
              <input type="text" placeholder="Type a command..." value={commandQuery} onChange={(e) => setCommandQuery(e.target.value)} autoFocus />
              <FiX size={20} className="icon-btn" onClick={() => setShowCommandPalette(false)} />
            </div>
            <div className="cp-list">
              {filteredCommands.length === 0 ? <div className="cp-empty">No commands match</div> : filteredCommands.map(cmd => (
                <button key={cmd.id} className="cp-item" onClick={() => runCommand(cmd)}>{cmd.icon} <span>{cmd.label}</span></button>
              ))}
            </div>
          </div>
        </div>
      )}

      {alertConfig.visible && (
        <div className="modal-overlay">
          <div className="custom-alert-box">
            <div className={`alert-icon ${alertConfig.type}`}>{alertConfig.type === 'success' ? <FiCheckCircle size={32} /> : <FiAlertCircle size={32} />}</div>
            <h3>{alertConfig.title}</h3>
            <p>{alertConfig.message}</p>
            {alertConfig.isPrompt && <input type="text" className="alert-input" placeholder="filename.js" value={alertConfig.inputValue} onChange={(e) => setAlertConfig({ ...alertConfig, inputValue: e.target.value })} autoFocus />}
            <div className="alert-actions">
              <button className="alert-btn cancel" onClick={closeAlert}>Cancel</button>
              <button className="alert-btn confirm" onClick={() => { if (alertConfig.onConfirm) alertConfig.onConfirm(alertConfig.inputValue); closeAlert(); }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {contextMenu.visible && (
        <>
          <div className="ctx-backdrop" onClick={() => setContextMenu(c => ({ ...c, visible: false }))} onContextMenu={(e) => { e.preventDefault(); setContextMenu(c => ({ ...c, visible: false })); }} />
          <div className="ctx-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
            <button disabled={selectionInfo.count === 0} onClick={handleCut}><FiScissors size={15} /> Cut <kbd>Ctrl+X</kbd></button>
            <button disabled={selectionInfo.count === 0} onClick={handleCopy}><FiCopy size={15} /> Copy <kbd>Ctrl+C</kbd></button>
            <button onClick={handlePaste}><FiClipboard size={15} /> Paste <kbd>Ctrl+V</kbd></button>
            <div className="ctx-sep" />
            <button onClick={handleSelectAll}><FiAlignLeft size={15} /> Select All <kbd>Ctrl+A</kbd></button>
            <button disabled={selectionInfo.count === 0} className="danger" onClick={handleDeleteSelection}><FiTrash2 size={15} /> Delete</button>
          </div>
        </>
      )}

      {toastMsg && <div className="copy-toast">{toastMsg}</div>}

      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="custom-alert-box" onClick={e => e.stopPropagation()}>
            <FiCode size={48} color="#58A6FF" style={{ marginBottom: 16 }} />
            <h3>CodeX Premium Editor</h3>
            <p style={{ marginBottom: 24 }}>Version 1.1.4<br/>A powerful offline PWA code editor.</p>
            <button className="alert-btn confirm" onClick={() => setShowAbout(false)}>Close</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;