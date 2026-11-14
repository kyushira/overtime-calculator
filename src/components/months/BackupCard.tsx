import { Download, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import type { PayrollConfig } from '../../types/payroll';
import { backupFileName, exportBackup, isBackupTooLarge, mergeStores, parseBackup, type MonthsStore } from '../../utils/months';
import { btnOutline, Card } from '../ui';

interface Props {
  store: MonthsStore;
  setStore: Dispatch<SetStateAction<MonthsStore>>;
  config: PayrollConfig;
  onImportConfig: (raw: unknown) => void;
}

type Notice = { tone: 'good' | 'bad'; text: string };

/** JSON backup: saved months and pay settings live in this browser only. */
export function BackupCard({ store, setStore, config, onImportConfig }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const exportNow = () => {
    const blob = new Blob([exportBackup(store, config)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (isBackupTooLarge(file.size)) {
      input.value = '';
      setNotice({ tone: 'bad', text: 'Backup file is too large (max 2 MB).' });
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setNotice({ tone: 'bad', text: "Couldn't read that file." });
      return;
    } finally {
      input.value = ''; // so the same file can be picked again
    }

    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setNotice({ tone: 'bad', text: parsed.error });
      return;
    }

    const incoming = parsed.store;
    const count = incoming.months.length;
    let importedMonths = 0;
    if (count > 0 && window.confirm(`Import ${count} month${count === 1 ? '' : 's'}? Months with the same date will be replaced.`)) {
      setStore((s) => mergeStores(s, incoming));
      importedMonths = count;
    }

    let importedSettings = false;
    if (parsed.config !== null && window.confirm('Also restore pay settings from the backup?')) {
      onImportConfig(parsed.config);
      importedSettings = true;
    }

    const parts: string[] = [];
    if (importedMonths) parts.push(`${importedMonths} month${importedMonths === 1 ? '' : 's'}`);
    if (importedSettings) parts.push('pay settings');
    setNotice(
      parts.length
        ? { tone: 'good', text: `Imported ${parts.join(' and ')}.` }
        : { tone: 'bad', text: 'Nothing imported.' },
    );
  };

  return (
    <Card title="Backup" subtitle="Saved months live in this browser only" index={3} className="lg:col-span-2 lg:row-start-3">
      <p className="text-sm text-slate-600">
        To move your history to another device, export here and import there.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={exportNow} className={`${btnOutline} min-h-11 px-3.5`}>
          <Download size={16} strokeWidth={1.5} aria-hidden /> Export backup
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={`${btnOutline} min-h-11 px-3.5`}>
          <Upload size={16} strokeWidth={1.5} aria-hidden /> Import backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onFile}
          tabIndex={-1}
          aria-hidden
        />
      </div>
      <div role="status" aria-live="polite" className="mt-3 empty:hidden">
        {notice && (
          <p className={`text-sm ${notice.tone === 'good' ? 'text-good' : 'text-bad'}`}>{notice.text}</p>
        )}
      </div>
    </Card>
  );
}
