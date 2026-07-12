// Kedua paket ini tidak menyertakan tipe TypeScript sendiri; deklarasi ini hanya mencakup
// method yang benar-benar dipakai di printer.ts, bukan seluruh permukaan API pustaka.

declare module '@point-of-sale/receipt-printer-encoder' {
  export interface ReceiptPrinterEncoderOptions {
    language?: 'esc-pos' | 'star-prnt' | 'star-line';
    codepageMapping?: string;
  }

  export default class ReceiptPrinterEncoder {
    constructor(options?: ReceiptPrinterEncoderOptions);
    initialize(): this;
    text(value: string): this;
    line(value: string): this;
    newline(): this;
    align(value: 'left' | 'center' | 'right'): this;
    bold(value?: boolean): this;
    cut(type?: 'full' | 'partial'): this;
    encode(): Uint8Array;
  }
}

declare module '@point-of-sale/webbluetooth-receipt-printer' {
  export interface ConnectedBluetoothPrinter {
    type: 'bluetooth';
    name: string;
    id: string;
    language: 'esc-pos' | 'star-prnt';
    codepageMapping: string;
  }

  export default class WebBluetoothReceiptPrinter {
    connect(): Promise<void>;
    reconnect(device: { id: string }): Promise<void>;
    disconnect(): Promise<void>;
    print(data: Uint8Array | Uint8Array[]): Promise<void>;
    addEventListener(event: 'connected', callback: (device: ConnectedBluetoothPrinter) => void): void;
    addEventListener(event: 'disconnected', callback: () => void): void;
  }
}
