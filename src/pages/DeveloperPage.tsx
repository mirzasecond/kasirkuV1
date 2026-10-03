import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function DeveloperPage() {
  const [dbSize, setDbSize] = useState<number>(0);
  const [transactionsCount, setTransactionsCount] = useState<number>(0);
  const [backupStatus, setBackupStatus] = useState<string>('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const dbResponse = await axios.get('http://localhost:3000/api/developer/db-stats');
      setDbSize(dbResponse.data.size_bytes);
      
      const txResponse = await axios.get('http://localhost:3000/api/developer/transaction-count');
      setTransactionsCount(txResponse.data.count);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const createBackup = async () => {
    try {
      setBackupStatus('Creating backup...');
      const response = await axios.post('http://localhost:3000/api/developer/backup');
      setBackupStatus(response.data.message);
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (error: any) {
      setBackupStatus(`Error: ${error.response?.data?.message || 'Failed to create backup'}`);
    }
  };

  const restoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setBackupStatus('Restoring backup...');
      const formData = new FormData();
      formData.append('backup', file);
      
      await axios.post('http://localhost:3000/api/developer/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      setBackupStatus('Backup restored successfully!');
      setTimeout(() => {
        setBackupStatus('');
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      setBackupStatus(`Error: ${error.response?.data?.message || 'Failed to restore backup'}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Developer Tools</h1>

        {/* System Stats */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">System Statistics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-gray-600 text-sm">Database Size</div>
              <div className="text-2xl font-bold">{(dbSize / 1024 / 1024).toFixed(2)} MB</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Total Transactions</div>
              <div className="text-2xl font-bold">{transactionsCount}</div>
            </div>
          </div>
        </div>

        {/* Backup & Restore */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Database Backup & Restore</h2>
          
          <div className="space-y-4">
            <button
              onClick={createBackup}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              Create Backup
            </button>

            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Restore from Backup:
              </label>
              <input
                type="file"
                accept=".zip,.sqlite"
                onChange={restoreBackup}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                "
              />
            </div>

            {backupStatus && (
              <div className={`mt-4 p-4 rounded-lg ${
                backupStatus.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                {backupStatus}
              </div>
            )}
          </div>
        </div>

        {/* Database Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Database Information</h2>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
{`
SQLite Version: Modern WAL mode enabled
Foreign Keys: Enabled
Auto-vacuum: Disabled (manual optimization recommended)
Last Optimization: Run manually via SQL command

Schema Tables:
- products (inventory)
- transactions (sales records)
- transaction_items (line items)
- stock_movements (inventory changes)
- users (system users)
- discount_rules (promotional rules)
- notifications_queue (Telegram queue)
`}
          </pre>
        </div>
      </div>
    </div>
  );
}
