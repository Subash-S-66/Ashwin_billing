import React, { useMemo } from 'react';
import { FileText } from 'lucide-react';

const ReportView = ({
  report,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  fetchRangeReport,
  downloadExcel
}) => {
  const totalSales = useMemo(() => {
    return report.reduce((sum, s) => sum + s.total, 0);
  }, [report]);

  return (
    <div className="report-view">
      <h2>Daily Sales Report</h2>
      <div className="report-summary">
        <div className="summary-card">
          <h3>Total Sales</h3>
          <p>₹{totalSales.toFixed(2)}</p>
        </div>
        <div className="summary-card">
          <h3>Orders</h3>
          <p>{report.length}</p>
        </div>
        <div className="summary-card date-filter no-print">
          <h3>Filter Dates</h3>
          <div className="flex-row" style={{ gap: '10px', marginTop: '10px' }}>
            <input type="date" className="search-box" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <input type="date" className="search-box" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <button className="btn-primary" onClick={fetchRangeReport}>Filter</button>
          </div>
        </div>
        <div className="flex-row no-print" style={{ gap: '10px' }}>
          <button className="btn-secondary" onClick={downloadExcel} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <FileText size={18} /> Download Excel
          </button>
          <button className="btn-primary" onClick={() => window.print()}>Print Report</button>
        </div>
      </div>

      <div className="table-container">
        <table className="report-table">
          <thead>
            <tr>
              <th>Invoice ID</th>
              <th>Time</th>
              <th>Items Details</th>
              <th>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.map(sale => (
              <tr key={sale.id}>
                <td data-label="Invoice ID">#{sale.id}</td>
                <td data-label="Time">{new Date(sale.timestamp).toLocaleTimeString()}</td>
                <td data-label="Items Details">{sale.items.map(i => `${i.category ? i.category + ' - ' : ''}${i.name} (x${i.qty})`).join(', ')}</td>
                <td data-label="Total Amount">₹{sale.total.toFixed(2)}</td>
              </tr>
            ))}
            {report.length === 0 && (
              <tr><td colSpan="4" className="text-center" style={{ display: 'table-cell' }}>No sales yet today.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportView;
