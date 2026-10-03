import React, { useState, useEffect } from 'react';
import { ArrowLeft, Settings as SettingsIcon, Printer, Monitor } from 'lucide-react';

interface Settings {
  printerName: string;
  printPreviewEnabled: boolean;
  fullScreenEnabled: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

const DEFAULT_SETTINGS: Settings = {
  printerName: '',
  printPreviewEnabled: false,
  fullScreenEnabled: true,
  fontSize: 'medium',
};

const SETTINGS_KEY = 'kiosk_settings';

export const KioskSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [printers, setPrinters] = useState<string[]>([]);

  // Load settings from localStorage on mount
  useEffect(() => {
    loadSettings();
    detectAvailablePrinters();
    
    // Check for full screen
    if ('fullscreenElement' in document ? (document as any).fullscreenElement : (document as any).webkitFullscreenElement) {
      enableFullScreen();
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    
    // Apply settings immediately
    applyFontSize();
    handleFullScreenToggle();
  }, [settings]);

  const loadSettings = () => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const detectAvailablePrinters = async () => {
    // Try to get available printers (requires permission in some browsers)
      try {
        const printingAPI = (navigator as any).printing;
        if (printingAPI && printingAPI.printers) {
          const devices = await printingAPI.getPrinters();
          const printerNames: string[] = devices.map((d: any) => d.name || d.deviceDescription);
          setPrinters(printerNames);
      } else {
        // Fallback to system defaults
        setPrinters(['Epson TM-T88V (USB)', 'Brother HL-L2350D (Network)', 'Default']);
      }
    } catch (error) {
      // If not supported, use fallback options
      setPrinters(['Epson TM-T88V (USB)', 'Brother HL-L2350D (Network)', 'Default']);
    }
  };

  const handlePrinterChange = (value: string) => {
    setSettings(prev => ({ ...prev, printerName: value }));
  };

  const togglePrintPreview = () => {
    setSettings(prev => ({ ...prev, printPreviewEnabled: !prev.printPreviewEnabled }));
  };

  const handleFullScreenToggle = () => {
    if (settings.fullScreenEnabled) {
      enableFullScreen();
    } else {
      exitFullScreen();
    }
  };

  const enableFullScreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => {
        console.warn('Fullscreen enable failed:', err.message);
      });
    } else if ((elem as any).webkitRequestFullscreen) {
      (elem as any).webkitRequestFullscreen();
    }
  };

  const exitFullScreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(err => {
        console.warn('Fullscreen exit failed:', err.message);
      });
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    }
    setSettings(prev => ({ ...prev, fullScreenEnabled: false }));
  };

  const applyFontSize = () => {
    const root = document.documentElement;
    switch (settings.fontSize) {
      case 'small':
        root.style.fontSize = '14px';
        break;
      case 'large':
        root.style.fontSize = '18px';
        break;
      default:
        root.style.fontSize = '16px';
    }
  };

  const handleFontSizeChange = (value: 'small' | 'medium' | 'large') => {
    setSettings(prev => ({ ...prev, fontSize: value }));
  };

  // Full screen listener
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = 'fullscreenElement' in document ? (document as any).fullscreenElement : (document as any).webkitFullscreenElement;
      if (!isFs) {
        setSettings(prev => ({ ...prev, fullScreenEnabled: false }));
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-4">
        <button 
          onClick={() => window.location.href = '/kiosk'}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5 mr-1" />
          Back to Beranda
        </button>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 text-blue-600" />
          Pengaturan Kasir
        </h1>
        <div className="ml-auto text-sm text-green-600 flex items-center gap-1">
          <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
          Auto-saved
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Printer Settings */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
            Pengaturan Printer
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pilih Printer Struk
              </label>
              <select 
                value={settings.printerName}
                onChange={(e) => handlePrinterChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>-- Pilih Printer --</option>
                {printers.length > 0 ? (
                  printers.map(printer => (
                    <option key={printer} value={printer}>{printer}</option>
                  ))
                ) : (
                  <>
                    <option value="epson-tm-t88v">Epson TM-T88V (USB)</option>
                    <option value="brother-hl-l2350d">Brother HL-L2350D (Network)</option>
                    <option value="default">Default System Printer</option>
                  </>
                )}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {settings.printerName ? `✅ ${settings.printerName} selected` : 'Pilih printer untuk struk penjualan'}
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Printer className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium">Print Preview Before Submit</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={settings.printPreviewEnabled}
                  onChange={togglePrintPreview}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className={`ml-3 text-sm font-medium ${settings.printPreviewEnabled ? 'text-green-600' : 'text-gray-700'}`}>
                  {settings.printPreviewEnabled ? 'On' : 'Off'}
                </span>
              </label>
            </div>
          </div>
        </section>

        {/* Display Settings */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
            Pengaturan Tampilan
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium">Full Screen Mode</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={settings.fullScreenEnabled}
                  onChange={handleFullScreenToggle}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className={`ml-3 text-sm font-medium ${settings.fullScreenEnabled ? 'text-green-600' : 'text-gray-700'}`}>
                  {settings.fullScreenEnabled ? 'On' : 'Off'}
                </span>
              </label>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ukuran Font UI
              </label>
              <select 
                value={settings.fontSize}
                onChange={(e) => handleFontSizeChange(e.target.value as 'small' | 'medium' | 'large')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="small">Kecil</option>
                <option value="medium">Sedang</option>
                <option value="large">Besar</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Ubah ukuran teks untuk kenyamanan membaca
              </p>
            </div>
          </div>
        </section>

        {/* Keyboard Shortcuts */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b">
            Pintasan Keyboard
          </h2>
          
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <span className="text-sm text-gray-700">Checkout / Pembayaran</span>
              <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">F9</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <span className="text-sm text-gray-700">Cari Produk</span>
              <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">Ctrl + F</kbd>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-700">Baru Transaksi</span>
              <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono">Ctrl + N</kbd>
            </div>
          </div>
        </section>

        {/* Reset Section */}
        <section className="pt-4 border-t border-gray-200">
          <button
            onClick={() => {
              if (confirm('Reset all settings to default?')) {
                localStorage.removeItem(SETTINGS_KEY);
                window.location.reload();
              }
            }}
            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium"
          >
            Reset All Settings to Default
          </button>
        </section>

        {/* Info */}
        <section className="pt-4 border-t border-gray-200">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
            <div className="flex">
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Untuk pengaturan lebih lanjut, hubungi administrator sistem.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default KioskSettingsPage;
