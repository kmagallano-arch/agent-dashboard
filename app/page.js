"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Line, Legend, Area, ComposedChart } from 'recharts';

const SHEET_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRXfIKIP4CFEUG6LGRhI6MPCSyvqwjOHFw-kn2VvJy4ZAmtBcVO9Z74g5mcaRuEPQrNGSitk0BWXemo/pub?output=csv';

const SHEET_URLS = {
  qa: `${SHEET_BASE}&gid=0`,
  productivity: `${SHEET_BASE}&gid=1904474818`,
  csat: `${SHEET_BASE}&gid=2057552355`,
  refunds: `${SHEET_BASE}&gid=868787773`,
  chargebacks: `${SHEET_BASE}&gid=2061572475`,
  business: `${SHEET_BASE}&gid=2032573496`,
};

const parseCSV = (csv) => {
  if (!csv || csv.includes('<!DOCTYPE') || csv.includes('<html')) return [];
  const rows = [];
  let currentRow = [], currentField = '', inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i], nextChar = csv[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') { currentField += '"'; i++; }
      else if (char === '"') inQuotes = false;
      else currentField += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { currentRow.push(currentField.trim()); currentField = ''; }
      else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        if (currentRow.length > 1 || currentRow[0] !== '') rows.push(currentRow);
        currentRow = []; currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField.trim()); if (currentRow.length > 1 || currentRow[0] !== '') rows.push(currentRow); }
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').replace(/\n/g, '').trim(); });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
};

const parseChargebacksCSV = (csv) => {
  if (!csv || csv.includes('<!DOCTYPE') || csv.includes('<html')) return { midSummary: [], midTotal: null, details: [] };
  const rows = [];
  let currentRow = [], currentField = '', inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i], nextChar = csv[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') { currentField += '"'; i++; }
      else if (char === '"') inQuotes = false;
      else currentField += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ',') { currentRow.push(currentField.trim()); currentField = ''; }
      else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim()); rows.push(currentRow);
        currentRow = []; currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) { currentRow.push(currentField.trim()); rows.push(currentRow); }

  let detailsStartIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'Case ID' || rows[i][0]?.includes('Case')) { detailsStartIdx = i; break; }
  }

  const midSummary = [];
  let midTotal = null;
  for (let i = 2; i < (detailsStartIdx > 0 ? detailsStartIdx : rows.length); i++) {
    const row = rows[i];
    if (row && row[0] && row[0] !== '' && !row[0].includes('Case')) {
      // Parse CB% - just use the raw value from the sheet
      let cbPct = parseFloat(row[3]) || 0;
      
      const entry = { mid: row[0]?.trim() || '', chargebacks: parseInt(row[1]) || 0, payments: parseInt(row[2]) || 0, cbPct: cbPct };
      if (row[0] === 'Total/Avg') {
        midTotal = entry;
      } else {
        midSummary.push(entry);
      }
    }
  }

  const details = [];
  if (detailsStartIdx >= 0 && detailsStartIdx + 1 < rows.length) {
    for (let i = detailsStartIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (row && row[0] && row[0] !== '') {
        details.push({ caseId: row[0]?.trim() || '', filingDate: row[1]?.trim() || '', transactionId: row[2]?.trim() || '', reason: row[3]?.trim() || '', amount: parseFloat(row[4]) || 0, currency: row[5]?.trim() || '', paymentMethod: row[6]?.trim() || '', orderId: row[7]?.trim() || '', sku: row[8]?.trim() || '', product: row[9]?.trim() || '', country: row[10]?.trim() || '' });
      }
    }
  }
  return { midSummary, midTotal, details };
};

const cleanText = (str) => !str ? '' : String(str).replace(/\n/g, '').replace(/\\n/g, '').trim();
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const str = cleanText(dateStr);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < monthNames.length; i++) {
    if (str.startsWith(monthNames[i])) {
      const match = str.match(/([A-Za-z]+)\s+(\d+),?\s+(\d+)/);
      if (match) return `${match[3]}-${(monthNames.indexOf(match[1]) + 1).toString().padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    }
  }
  if (str.includes('/')) { const parts = str.split('/'); if (parts.length === 3) { let year = parseInt(parts[2]); if (year < 100) year += 2000; return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`; } }
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) return str.substring(0, 10);
  return str;
};
const parseNumber = (val) => { if (val === null || val === undefined || val === '' || val === 'nan') return 0; const num = parseFloat(String(val).replace(/[^0-9.\-]/g, '')); return isNaN(num) ? 0 : num; };

const GRADE_COLORS = { 'A+': '#047857', 'A': '#059669', 'A-': '#10b981', 'B+': '#22c55e', 'B': '#84cc16', 'C+': '#eab308', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444' };
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f43f5e', '#84cc16', '#6366f1', '#14b8a6'];
const tooltipStyle = { background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#e2e8f0' };

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState('qa');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quickRange, setQuickRange] = useState('all');
  const [loading, setLoading] = useState(true);
  const [qaData, setQaData] = useState([]);
  const [productivityData, setProductivityData] = useState([]);
  const [csatData, setCsatData] = useState([]);
  const [refundsData, setRefundsData] = useState([]);
  const [chargebackMidData, setChargebackMidData] = useState([]);
  const [chargebackMidTotal, setChargebackMidTotal] = useState(null);
  const [chargebackDetailsData, setChargebackDetailsData] = useState([]);
  const [businessData, setBusinessData] = useState([]);

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const [qaRes, prodRes, csatRes, refundsRes, cbRes, bizRes] = await Promise.all([
          fetch(SHEET_URLS.qa).then(r => r.text()).catch(() => ''),
          fetch(SHEET_URLS.productivity).then(r => r.text()).catch(() => ''),
          fetch(SHEET_URLS.csat).then(r => r.text()).catch(() => ''),
          fetch(SHEET_URLS.refunds).then(r => r.text()).catch(() => ''),
          fetch(SHEET_URLS.chargebacks).then(r => r.text()).catch(() => ''),
          fetch(SHEET_URLS.business).then(r => r.text()).catch(() => ''),
        ]);

        const qa = parseCSV(qaRes).map(row => ({ date: parseDate(row['Date']), agent: cleanText(row['Agent Name']), score: parseNumber(row['Final Score']), grade: cleanText(row['Grade']), softSkills: parseNumber(row['Soft Skills']), issueUnderstanding: parseNumber(row['Issue Understanding']), productProcess: parseNumber(row['Product & Process']), toolsUtilization: parseNumber(row['Tools Utilization']), violation: cleanText(row['Zero Tolerance Violation']) || 'No' })).filter(r => r.agent);
        const prod = parseCSV(prodRes).map(row => ({ date: parseDate(row['Date']), agent: cleanText(row['Agent Name']) || cleanText(row['Agent']), ticketsHandled: parseNumber(row['Tickets replied']), ticketsPerHour: parseNumber(row['Ticket/hour']), hoursWorked: parseNumber(row['Hours Worked']) })).filter(r => r.agent && r.agent !== '#REF!');
        const csat = parseCSV(csatRes).map(row => ({ date: parseDate(row['date']), agent: cleanText(row['Agent Name']) || cleanText(row['assignee']), score: parseNumber(row['score']) })).filter(r => r.agent && r.score >= 1 && r.score <= 5);
        const refunds = parseCSV(refundsRes).map(row => ({ date: parseDate(row['Refund Date']), agent: cleanText(row['Refunded By']), amount: parseNumber(row['Refund Amt EUR']) || parseNumber(row['Refund Amount']), reason: cleanText(row['Refund Reason 1']) })).filter(r => r.agent && r.agent.length > 0);
        const { midSummary, midTotal, details } = parseChargebacksCSV(cbRes);
        const cbDetails = details.map(d => ({ ...d, date: parseDate(d.filingDate) }));
        const biz = parseCSV(bizRes).map(row => ({ date: parseDate(row['date']), store: cleanText(row['store']), product: cleanText(row['friendly_name']), revenue: parseNumber(row['revenue']), unitsSold: parseNumber(row['units_sold']), refunds: parseNumber(row['refunds']), cogs: parseNumber(row['total_cogs']), adSpend: parseNumber(row['total_ad_spend']), netProfit: parseNumber(row['net_profit']), orders: parseNumber(row['n_orders']) })).filter(r => r.date);

        setQaData(qa); setProductivityData(prod); setCsatData(csat); setRefundsData(refunds);
        setChargebackMidData(midSummary); setChargebackMidTotal(midTotal); setChargebackDetailsData(cbDetails); setBusinessData(biz);

        const allDates = [...qa, ...prod, ...csat, ...refunds, ...cbDetails, ...biz].map(r => r.date).filter(d => d && d.match(/^\d{4}-\d{2}-\d{2}$/)).sort();
        if (allDates.length > 0) { setStartDate(allDates[0]); setEndDate(allDates[allDates.length - 1]); }
      } catch (err) { console.error('Failed to load:', err); }
      setLoading(false);
    };
    fetchAllData();
  }, []);

  const sections = [
    { id: 'qa', label: 'QA', icon: '📋', count: qaData.length },
    { id: 'productivity', label: 'Productivity', icon: '⚡', count: productivityData.length },
    { id: 'csat', label: 'CSAT', icon: '⭐', count: csatData.length },
    { id: 'refunds', label: 'Refunds', icon: '💰', count: refundsData.length },
    { id: 'chargebacks', label: 'Chargebacks', icon: '⚠️', count: chargebackDetailsData.length },
    { id: 'business', label: 'Business', icon: '📊', count: businessData.length },
  ];

  const allDates = useMemo(() => [...new Set([...qaData, ...productivityData, ...csatData, ...refundsData, ...chargebackDetailsData, ...businessData].map(r => r.date).filter(d => d && d.match(/^\d{4}-\d{2}-\d{2}$/)))].sort(), [qaData, productivityData, csatData, refundsData, chargebackDetailsData, businessData]);

  const quickRanges = useMemo(() => {
    if (allDates.length === 0) return [];
    const latest = allDates[allDates.length - 1], earliest = allDates[0];
    const latestDate = new Date(latest);
    const yesterday = new Date(latestDate); yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(latestDate); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(latestDate); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return [
      { id: 'today', label: 'Today', start: latest, end: latest },
      { id: 'yesterday', label: 'Yesterday', start: yesterday.toISOString().split('T')[0], end: yesterday.toISOString().split('T')[0] },
      { id: 'last7', label: 'Last 7 Days', start: sevenDaysAgo.toISOString().split('T')[0], end: latest },
      { id: 'last30', label: 'Last 30 Days', start: thirtyDaysAgo.toISOString().split('T')[0], end: latest },
      { id: 'all', label: 'All Time', start: earliest, end: latest },
    ];
  }, [allDates]);

  const handleQuickRange = (id) => { setQuickRange(id); const r = quickRanges.find(x => x.id === id); if (r) { setStartDate(r.start); setEndDate(r.end); } };
  const clearFilters = () => { if (allDates.length > 0) { setStartDate(allDates[0]); setEndDate(allDates[allDates.length - 1]); setQuickRange('all'); } };
  const filterByDate = (data) => !startDate || !endDate ? data : data.filter(item => !item.date || (item.date >= startDate && item.date <= endDate));

  const filteredQA = useMemo(() => filterByDate(qaData), [qaData, startDate, endDate]);
  const filteredProd = useMemo(() => filterByDate(productivityData), [productivityData, startDate, endDate]);
  const filteredCSAT = useMemo(() => filterByDate(csatData), [csatData, startDate, endDate]);
  const filteredRefunds = useMemo(() => filterByDate(refundsData), [refundsData, startDate, endDate]);
  const filteredChargebacks = useMemo(() => filterByDate(chargebackDetailsData), [chargebackDetailsData, startDate, endDate]);
  const filteredBiz = useMemo(() => filterByDate(businessData), [businessData, startDate, endDate]);

  // QA summaries
  const qaSummary = useMemo(() => {
    const s = filteredQA.reduce((a, i) => { if (!i.agent) return a; if (!a[i.agent]) a[i.agent] = { agent: i.agent, totalScore: 0, count: 0, violations: 0, grades: {} }; a[i.agent].totalScore += i.score; a[i.agent].count++; if (i.violation === 'Yes') a[i.agent].violations++; if (i.grade) a[i.agent].grades[i.grade] = (a[i.agent].grades[i.grade] || 0) + 1; return a; }, {});
    return Object.values(s).map(x => ({ agent: x.agent, avgScore: x.count ? +(x.totalScore / x.count).toFixed(1) : 0, evaluations: x.count, violations: x.violations, topGrade: Object.entries(x.grades).sort((a,b) => b[1] - a[1])[0]?.[0] || '-' })).sort((a, b) => b.avgScore - a.avgScore);
  }, [filteredQA]);
  const qaTrend = useMemo(() => { const s = filteredQA.reduce((a, i) => { if (!i.date) return a; if (!a[i.date]) a[i.date] = { date: i.date, totalScore: 0, count: 0 }; a[i.date].totalScore += i.score; a[i.date].count++; return a; }, {}); return Object.values(s).map(x => ({ date: x.date, avgScore: x.count ? +(x.totalScore / x.count).toFixed(1) : 0, evaluations: x.count })).sort((a, b) => a.date.localeCompare(b.date)); }, [filteredQA]);
  const gradeData = useMemo(() => Object.entries(filteredQA.reduce((a, i) => { if (i.grade) a[i.grade] = (a[i.grade] || 0) + 1; return a; }, {})).map(([g, c]) => ({ grade: g, count: c })).sort((a,b) => b.count - a.count), [filteredQA]);

  // Productivity summaries
  const prodSummary = useMemo(() => { const s = filteredProd.reduce((a, i) => { if (!i.agent) return a; if (!a[i.agent]) a[i.agent] = { agent: i.agent, tickets: 0, hours: 0, count: 0 }; a[i.agent].tickets += i.ticketsHandled; a[i.agent].hours += i.hoursWorked; a[i.agent].count++; return a; }, {}); return Object.values(s).map(x => ({ agent: x.agent, ticketsHandled: Math.round(x.tickets), hoursWorked: +x.hours.toFixed(1), ticketsPerHour: x.hours > 0 ? +(x.tickets / x.hours).toFixed(1) : 0, days: x.count })).sort((a, b) => b.ticketsHandled - a.ticketsHandled); }, [filteredProd]);
  const prodTrend = useMemo(() => { const s = filteredProd.reduce((a, i) => { if (!i.date) return a; if (!a[i.date]) a[i.date] = { date: i.date, tickets: 0, hours: 0 }; a[i.date].tickets += i.ticketsHandled; a[i.date].hours += i.hoursWorked; return a; }, {}); return Object.values(s).map(x => ({ date: x.date, tickets: Math.round(x.tickets), hours: +x.hours.toFixed(1) })).sort((a, b) => a.date.localeCompare(b.date)); }, [filteredProd]);

  // CSAT summaries
  const csatSummary = useMemo(() => { const s = filteredCSAT.reduce((a, i) => { if (!i.agent) return a; if (!a[i.agent]) a[i.agent] = { agent: i.agent, totalScore: 0, count: 0, f5: 0, f4: 0, f3: 0, f2: 0, f1: 0 }; a[i.agent].totalScore += i.score; a[i.agent].count++; if (i.score === 5) a[i.agent].f5++; else if (i.score === 4) a[i.agent].f4++; else if (i.score === 3) a[i.agent].f3++; else if (i.score === 2) a[i.agent].f2++; else if (i.score === 1) a[i.agent].f1++; return a; }, {}); return Object.values(s).map(x => ({ agent: x.agent, avgRating: x.count ? +(x.totalScore / x.count).toFixed(2) : 0, responses: x.count, fiveStar: x.f5, fourStar: x.f4, threeStar: x.f3, twoStar: x.f2, oneStar: x.f1, positiveRate: x.count ? Math.round(((x.f5 + x.f4) / x.count) * 100) : 0 })).sort((a, b) => b.avgRating - a.avgRating); }, [filteredCSAT]);
  const csatTrend = useMemo(() => { const s = filteredCSAT.reduce((a, i) => { if (!i.date) return a; if (!a[i.date]) a[i.date] = { date: i.date, totalScore: 0, count: 0 }; a[i.date].totalScore += i.score; a[i.date].count++; return a; }, {}); return Object.values(s).map(x => ({ date: x.date, avgRating: x.count ? +(x.totalScore / x.count).toFixed(2) : 0, responses: x.count })).sort((a, b) => a.date.localeCompare(b.date)); }, [filteredCSAT]);

  // Refunds summaries
  const refundSummary = useMemo(() => { const s = filteredRefunds.reduce((a, i) => { if (!i.agent) return a; if (!a[i.agent]) a[i.agent] = { agent: i.agent, count: 0, amount: 0 }; a[i.agent].count++; a[i.agent].amount += i.amount; return a; }, {}); return Object.values(s).map(x => ({ agent: x.agent, refundsProcessed: x.count, totalAmount: +x.amount.toFixed(2), avgAmount: x.count ? +(x.amount / x.count).toFixed(2) : 0 })).sort((a, b) => b.refundsProcessed - a.refundsProcessed); }, [filteredRefunds]);
  const refundTrend = useMemo(() => { const s = filteredRefunds.reduce((a, i) => { if (!i.date) return a; if (!a[i.date]) a[i.date] = { date: i.date, count: 0, amount: 0 }; a[i.date].count++; a[i.date].amount += i.amount; return a; }, {}); return Object.values(s).map(x => ({ date: x.date, refunds: x.count, amount: +x.amount.toFixed(2) })).sort((a, b) => a.date.localeCompare(b.date)); }, [filteredRefunds]);
  const refundsByReason = useMemo(() => { const s = filteredRefunds.reduce((a, i) => { let reason = i.reason || 'Other'; if (reason.length > 20) reason = reason.substring(0, 20) + '...'; if (!a[reason]) a[reason] = { reason, count: 0 }; a[reason].count++; return a; }, {}); return Object.values(s).sort((a, b) => b.count - a.count).slice(0, 8); }, [filteredRefunds]);

  // Chargebacks summaries
  const cbByMid = useMemo(() => { if (filteredChargebacks.length > 0) { const s = filteredChargebacks.reduce((a, i) => { const mid = i.paymentMethod || 'Unknown'; if (!a[mid]) a[mid] = { mid, count: 0, amount: 0 }; a[mid].count++; a[mid].amount += i.amount; return a; }, {}); return Object.values(s).sort((a, b) => b.count - a.count); } return chargebackMidData.map(m => ({ mid: m.mid, count: m.chargebacks, payments: m.payments, cbPct: m.cbPct, amount: 0 })).filter(m => m.mid); }, [filteredChargebacks, chargebackMidData]);
  const cbByProduct = useMemo(() => { const s = filteredChargebacks.reduce((a, i) => { const product = i.product || 'Unknown'; if (!a[product]) a[product] = { product, count: 0, amount: 0, reasons: {} }; a[product].count++; a[product].amount += i.amount; if (i.reason) a[product].reasons[i.reason] = (a[product].reasons[i.reason] || 0) + 1; return a; }, {}); return Object.values(s).map(x => ({ ...x, topReason: Object.entries(x.reasons).sort((a,b) => b[1] - a[1])[0]?.[0] || '-' })).sort((a, b) => b.count - a.count); }, [filteredChargebacks]);
  const cbByReason = useMemo(() => { const s = filteredChargebacks.reduce((a, i) => { const reason = i.reason || 'Unknown'; if (!a[reason]) a[reason] = { reason, count: 0 }; a[reason].count++; return a; }, {}); return Object.values(s).sort((a, b) => b.count - a.count); }, [filteredChargebacks]);
  const cbTrend = useMemo(() => { const s = filteredChargebacks.reduce((a, i) => { if (!i.date) return a; if (!a[i.date]) a[i.date] = { date: i.date, count: 0, amount: 0 }; a[i.date].count++; a[i.date].amount += i.amount; return a; }, {}); return Object.values(s).map(x => ({ date: x.date, chargebacks: x.count, amount: +x.amount.toFixed(2) })).sort((a, b) => a.date.localeCompare(b.date)); }, [filteredChargebacks]);

  // Business summaries
  const bizSummary = useMemo(() => ({ totalRevenue: filteredBiz.reduce((s, d) => s + d.revenue, 0), totalOrders: filteredBiz.reduce((s, d) => s + d.orders, 0), totalUnits: filteredBiz.reduce((s, d) => s + d.unitsSold, 0), totalRefunds: filteredBiz.reduce((s, d) => s + d.refunds, 0), totalCogs: filteredBiz.reduce((s, d) => s + d.cogs, 0), netProfit: filteredBiz.reduce((s, d) => s + d.netProfit, 0), adSpend: filteredBiz.reduce((s, d) => s + d.adSpend, 0) }), [filteredBiz]);
  const bizByProduct = useMemo(() => { const s = filteredBiz.reduce((a, i) => { const key = i.product || 'Unknown'; if (!a[key]) a[key] = { product: key, revenue: 0, orders: 0, units: 0, profit: 0, adSpend: 0, cogs: 0, refunds: 0 }; a[key].revenue += i.revenue; a[key].orders += i.orders; a[key].units += i.unitsSold; a[key].profit += i.netProfit; a[key].adSpend += i.adSpend; a[key].cogs += i.cogs; a[key].refunds += i.refunds; return a; }, {}); return Object.values(s).sort((a, b) => b.revenue - a.revenue); }, [filteredBiz]);
  const bizByStore = useMemo(() => { const s = filteredBiz.reduce((a, i) => { const key = i.store || 'Unknown'; if (!a[key]) a[key] = { store: key, revenue: 0, orders: 0, profit: 0 }; a[key].revenue += i.revenue; a[key].orders += i.orders; a[key].profit += i.netProfit; return a; }, {}); return Object.values(s).sort((a, b) => b.revenue - a.revenue); }, [filteredBiz]);
  const bizByDate = useMemo(() => { const s = filteredBiz.reduce((a, i) => { if (!i.date) return a; if (!a[i.date]) a[i.date] = { date: i.date, revenue: 0, orders: 0, profit: 0 }; a[i.date].revenue += i.revenue; a[i.date].orders += i.orders; a[i.date].profit += i.netProfit; return a; }, {}); return Object.values(s).sort((a, b) => a.date.localeCompare(b.date)); }, [filteredBiz]);

  const MetricCard = ({ title, value, color }) => (
    <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9))', border: '1px solid rgba(148,163,184,0.1)', borderRadius: '16px', padding: '16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: color }} />
      <div style={{ color: '#64748b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', color }}>{value}</div>
    </div>
  );

  const formatDate = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return d; } };
  const formatCurrency = (n, curr = '€') => { const abs = Math.abs(n); const sign = n < 0 ? '-' : ''; if (abs >= 1000000) return `${sign}${curr}${(abs / 1000000).toFixed(2)}M`; if (abs >= 1000) return `${sign}${curr}${(abs / 1000).toFixed(1)}K`; return `${sign}${curr}${abs.toFixed(0)}`; };

  if (loading) return (<div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e2e8f0' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div><div style={{ fontSize: '18px' }}>Loading dashboard data...</div></div></div>);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', fontFamily: 'system-ui, sans-serif', color: '#e2e8f0' }}>
      <style>{`
        .glass { background: rgba(30,41,59,0.7); border: 1px solid rgba(148,163,184,0.1); border-radius: 14px; }
        .nav-btn { padding: 8px 14px; background: transparent; border: 1px solid rgba(148,163,184,0.1); border-radius: 8px; color: #94a3b8; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 5px; transition: all 0.2s; }
        .nav-btn:hover { background: rgba(59,130,246,0.1); color: #e2e8f0; }
        .nav-btn.active { background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; border-color: transparent; }
        .quick-btn { padding: 5px 10px; background: rgba(30,41,59,0.6); border: 1px solid rgba(148,163,184,0.15); border-radius: 6px; color: #94a3b8; cursor: pointer; font-size: 11px; }
        .quick-btn:hover { background: rgba(59,130,246,0.1); color: #e2e8f0; }
        .quick-btn.active { background: rgba(59,130,246,0.2); border-color: #3b82f6; color: #3b82f6; }
        .clear-btn { padding: 5px 10px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; color: #f87171; cursor: pointer; font-size: 11px; }
        .clear-btn:hover { background: rgba(239,68,68,0.2); }
        .date-input { background: rgba(30,41,59,0.8); border: 1px solid rgba(148,163,184,0.2); border-radius: 6px; padding: 6px 10px; color: #e2e8f0; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { padding: 10px 8px; text-align: left; color: #64748b; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid rgba(148,163,184,0.1); white-space: nowrap; }
        td { padding: 10px 8px; border-bottom: 1px solid rgba(148,163,184,0.05); font-size: 12px; }
        tr:hover { background: rgba(59,130,246,0.05); }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 10px; margin-left: 4px; }
        .pill { padding: 3px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
      `}</style>

      <header style={{ padding: '14px 24px', borderBottom: '1px solid rgba(148,163,184,0.1)', background: 'rgba(15,23,42,0.5)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Agent & Business Dashboard</h1>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {sections.map(s => (<button key={s.id} className={`nav-btn ${activeSection === s.id ? 'active' : ''}`} onClick={() => setActiveSection(s.id)}>{s.icon} {s.label}<span className="badge" style={{ background: s.count > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', color: s.count > 0 ? '#10b981' : '#ef4444' }}>{s.count > 999 ? `${(s.count/1000).toFixed(1)}k` : s.count}</span></button>))}
          </div>
        </div>
      </header>

      <div style={{ padding: '12px 24px', background: 'rgba(15,23,42,0.3)', borderBottom: '1px solid rgba(148,163,184,0.1)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b', fontSize: '12px' }}>📅</span>
        <input type="date" className="date-input" value={startDate} onChange={e => { setStartDate(e.target.value); setQuickRange('custom'); }} />
        <span style={{ color: '#64748b' }}>to</span>
        <input type="date" className="date-input" value={endDate} onChange={e => { setEndDate(e.target.value); setQuickRange('custom'); }} />
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {quickRanges.map(r => <button key={r.id} className={`quick-btn ${quickRange === r.id ? 'active' : ''}`} onClick={() => handleQuickRange(r.id)}>{r.label}</button>)}
        </div>
        <button className="clear-btn" onClick={clearFilters}>✕ Clear</button>
        <div style={{ marginLeft: 'auto', padding: '4px 10px', background: 'rgba(59,130,246,0.1)', borderRadius: '6px', fontSize: '11px', color: '#3b82f6' }}>{formatDate(startDate)} - {formatDate(endDate)}</div>
      </div>

      <main style={{ padding: '20px 24px' }}>
        {/* QA Section */}
        {activeSection === 'qa' && (<div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <MetricCard title="Evaluations" value={filteredQA.length} color="#3b82f6" />
            <MetricCard title="Avg Score" value={filteredQA.length ? (filteredQA.reduce((s, a) => s + a.score, 0) / filteredQA.length).toFixed(1) : '0'} color="#10b981" />
            <MetricCard title="Pass Rate" value={`${filteredQA.length ? Math.round((filteredQA.filter(a => a.score >= 70).length / filteredQA.length) * 100) : 0}%`} color="#8b5cf6" />
            <MetricCard title="Violations" value={filteredQA.filter(a => a.violation === 'Yes').length} color="#ef4444" />
          </div>
          {qaTrend.length > 1 && (<div className="glass" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📈 QA Score Trend</h3><ResponsiveContainer width="100%" height={200}><ComposedChart data={qaTrend}><XAxis dataKey="date" stroke="#475569" fontSize={9} tickFormatter={formatDate} /><YAxis yAxisId="left" domain={[0, 100]} stroke="#475569" fontSize={9} /><YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={9} /><Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Line yAxisId="left" type="monotone" dataKey="avgScore" name="Avg Score" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} /><Bar yAxisId="right" dataKey="evaluations" name="Evaluations" fill="rgba(59,130,246,0.3)" /></ComposedChart></ResponsiveContainer></div>)}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>🏆 Agent Rankings</h3><ResponsiveContainer width="100%" height={220}><BarChart data={qaSummary.slice(0, 10)} layout="vertical"><XAxis type="number" domain={[0, 100]} stroke="#475569" fontSize={10} /><YAxis dataKey="agent" type="category" stroke="#475569" width={70} fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="avgScore" fill="url(#grad1)" radius={[0, 6, 6, 0]} /><defs><linearGradient id="grad1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs></BarChart></ResponsiveContainer></div>
            <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📊 Grade Distribution</h3><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={gradeData.length ? gradeData : [{grade:'N/A',count:1}]} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={75} innerRadius={40} label={({ grade, count }) => `${grade}:${count}`} labelLine={false}>{(gradeData.length ? gradeData : [{grade:'N/A',count:1}]).map((e, i) => <Cell key={i} fill={GRADE_COLORS[e.grade] || '#64748b'} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer></div>
          </div>
          <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>👥 Agent Performance</h3><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Agent</th><th style={{textAlign:'center'}}>Evals</th><th style={{textAlign:'center'}}>Avg Score</th><th style={{textAlign:'center'}}>Grade</th><th style={{textAlign:'center'}}>Violations</th></tr></thead><tbody>{qaSummary.map(a => (<tr key={a.agent}><td style={{fontWeight:600}}>{a.agent}</td><td style={{textAlign:'center'}}>{a.evaluations}</td><td style={{textAlign:'center'}}><span className="pill" style={{background: a.avgScore >= 80 ? 'rgba(16,185,129,0.2)' : a.avgScore >= 70 ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)', color: a.avgScore >= 80 ? '#10b981' : a.avgScore >= 70 ? '#eab308' : '#ef4444'}}>{a.avgScore}</span></td><td style={{textAlign:'center'}}><span className="pill" style={{background: GRADE_COLORS[a.topGrade] ? `${GRADE_COLORS[a.topGrade]}33` : 'rgba(100,116,139,0.2)', color: GRADE_COLORS[a.topGrade] || '#64748b'}}>{a.topGrade}</span></td><td style={{textAlign:'center'}}>{a.violations > 0 ? <span style={{color:'#ef4444',fontWeight:600}}>{a.violations}</span> : <span style={{color:'#10b981'}}>0</span>}</td></tr>))}</tbody></table></div></div>
        </div>)}

        {/* Productivity Section */}
        {activeSection === 'productivity' && (<div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <MetricCard title="Total Tickets" value={prodSummary.reduce((s, a) => s + a.ticketsHandled, 0).toLocaleString()} color="#3b82f6" />
            <MetricCard title="Total Hours" value={`${prodSummary.reduce((s, a) => s + a.hoursWorked, 0).toFixed(0)}h`} color="#10b981" />
            <MetricCard title="Avg Tickets/Hr" value={(prodSummary.reduce((s, a) => s + a.ticketsHandled, 0) / Math.max(prodSummary.reduce((s, a) => s + a.hoursWorked, 0), 1)).toFixed(1)} color="#8b5cf6" />
            <MetricCard title="Agents" value={prodSummary.length} color="#f59e0b" />
          </div>
          {prodTrend.length > 1 && (<div className="glass" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📈 Productivity Trend</h3><ResponsiveContainer width="100%" height={200}><ComposedChart data={prodTrend}><XAxis dataKey="date" stroke="#475569" fontSize={9} tickFormatter={formatDate} /><YAxis yAxisId="left" stroke="#475569" fontSize={9} /><YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={9} /><Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar yAxisId="left" dataKey="tickets" name="Tickets" fill="#3b82f6" radius={[4, 4, 0, 0]} /><Line yAxisId="right" type="monotone" dataKey="hours" name="Hours" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div>)}
          <div className="glass" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>🏆 Tickets by Agent</h3><ResponsiveContainer width="100%" height={280}><BarChart data={prodSummary.slice(0, 15)}><XAxis dataKey="agent" stroke="#475569" fontSize={9} angle={-45} textAnchor="end" height={80} /><YAxis stroke="#475569" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="ticketsHandled" name="Tickets" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>👥 Agent Performance</h3><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Agent</th><th style={{textAlign:'center'}}>Tickets</th><th style={{textAlign:'center'}}>Hours</th><th style={{textAlign:'center'}}>Tickets/Hr</th><th style={{textAlign:'center'}}>Days</th></tr></thead><tbody>{prodSummary.map(a => (<tr key={a.agent}><td style={{fontWeight:600}}>{a.agent}</td><td style={{textAlign:'center',color:'#3b82f6',fontWeight:600}}>{a.ticketsHandled}</td><td style={{textAlign:'center'}}>{a.hoursWorked}h</td><td style={{textAlign:'center'}}><span className="pill" style={{background: a.ticketsPerHour >= 3 ? 'rgba(16,185,129,0.2)' : a.ticketsPerHour >= 2 ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)', color: a.ticketsPerHour >= 3 ? '#10b981' : a.ticketsPerHour >= 2 ? '#eab308' : '#ef4444'}}>{a.ticketsPerHour}</span></td><td style={{textAlign:'center'}}>{a.days}</td></tr>))}</tbody></table></div></div>
        </div>)}

        {/* CSAT Section */}
        {activeSection === 'csat' && (<div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <MetricCard title="Responses" value={filteredCSAT.length.toLocaleString()} color="#3b82f6" />
            <MetricCard title="Avg Rating" value={(filteredCSAT.reduce((s, a) => s + a.score, 0) / Math.max(filteredCSAT.length, 1)).toFixed(2)} color="#fbbf24" />
            <MetricCard title="5-Star Rate" value={`${Math.round((filteredCSAT.filter(a => a.score === 5).length / Math.max(filteredCSAT.length, 1)) * 100)}%`} color="#10b981" />
            <MetricCard title="Positive Rate" value={`${Math.round((filteredCSAT.filter(a => a.score >= 4).length / Math.max(filteredCSAT.length, 1)) * 100)}%`} color="#8b5cf6" />
          </div>
          {csatTrend.length > 1 && (<div className="glass" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📈 CSAT Trend</h3><ResponsiveContainer width="100%" height={200}><ComposedChart data={csatTrend}><XAxis dataKey="date" stroke="#475569" fontSize={9} tickFormatter={formatDate} /><YAxis yAxisId="left" domain={[0, 5]} stroke="#475569" fontSize={9} /><YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={9} /><Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Line yAxisId="left" type="monotone" dataKey="avgRating" name="Avg Rating" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} /><Bar yAxisId="right" dataKey="responses" name="Responses" fill="rgba(59,130,246,0.3)" /></ComposedChart></ResponsiveContainer></div>)}
          <div className="glass" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>⭐ Rating by Agent</h3><ResponsiveContainer width="100%" height={280}><BarChart data={csatSummary.slice(0, 15)} layout="vertical"><XAxis type="number" domain={[0, 5]} stroke="#475569" fontSize={10} /><YAxis dataKey="agent" type="category" stroke="#475569" width={80} fontSize={9} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="avgRating" fill="#fbbf24" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div>
          <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>👥 Agent CSAT Details</h3><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Agent</th><th style={{textAlign:'center'}}>Avg</th><th style={{textAlign:'center'}}>Responses</th><th style={{textAlign:'center'}}>5★</th><th style={{textAlign:'center'}}>4★</th><th style={{textAlign:'center'}}>3★</th><th style={{textAlign:'center'}}>2★</th><th style={{textAlign:'center'}}>1★</th><th style={{textAlign:'center'}}>Positive %</th></tr></thead><tbody>{csatSummary.map(a => (<tr key={a.agent}><td style={{fontWeight:600}}>{a.agent}</td><td style={{textAlign:'center'}}><span className="pill" style={{background:'rgba(251,191,36,0.2)',color:'#fbbf24'}}>{a.avgRating}</span></td><td style={{textAlign:'center'}}>{a.responses}</td><td style={{textAlign:'center',color:'#10b981'}}>{a.fiveStar}</td><td style={{textAlign:'center',color:'#22c55e'}}>{a.fourStar}</td><td style={{textAlign:'center',color:'#eab308'}}>{a.threeStar}</td><td style={{textAlign:'center',color:'#f97316'}}>{a.twoStar}</td><td style={{textAlign:'center',color:'#ef4444'}}>{a.oneStar}</td><td style={{textAlign:'center'}}><span className="pill" style={{background: a.positiveRate >= 90 ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.2)', color: a.positiveRate >= 90 ? '#10b981' : '#eab308'}}>{a.positiveRate}%</span></td></tr>))}</tbody></table></div></div>
        </div>)}

        {/* Refunds Section */}
        {activeSection === 'refunds' && (<div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <MetricCard title="Total Refunds" value={filteredRefunds.length.toLocaleString()} color="#3b82f6" />
            <MetricCard title="Total Amount" value={formatCurrency(filteredRefunds.reduce((s, a) => s + a.amount, 0))} color="#ef4444" />
            <MetricCard title="Avg Refund" value={formatCurrency(filteredRefunds.reduce((s, a) => s + a.amount, 0) / Math.max(filteredRefunds.length, 1))} color="#8b5cf6" />
            <MetricCard title="Agents" value={refundSummary.length} color="#f59e0b" />
          </div>
          {refundTrend.length > 1 && (<div className="glass" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📈 Refunds Trend</h3><ResponsiveContainer width="100%" height={200}><ComposedChart data={refundTrend}><XAxis dataKey="date" stroke="#475569" fontSize={9} tickFormatter={formatDate} /><YAxis yAxisId="left" stroke="#475569" fontSize={9} /><YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={9} tickFormatter={v => formatCurrency(v)} /><Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar yAxisId="left" dataKey="refunds" name="Count" fill="#3b82f6" radius={[4, 4, 0, 0]} /><Line yAxisId="right" type="monotone" dataKey="amount" name="Amount" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div>)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>👤 Refunds by Agent</h3><ResponsiveContainer width="100%" height={280}><BarChart data={refundSummary.slice(0, 15)}><XAxis dataKey="agent" stroke="#475569" fontSize={9} angle={-45} textAnchor="end" height={80} /><YAxis stroke="#475569" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="refundsProcessed" name="Refunds" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
            <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📋 By Reason</h3><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={refundsByReason.length ? refundsByReason : [{reason:'No Data',count:1}]} dataKey="count" nameKey="reason" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label={({reason}) => reason?.substring(0, 10) || ''}>{refundsByReason.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer></div>
          </div>
          <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>👥 Agent Refund Details</h3><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Agent</th><th style={{textAlign:'center'}}>Refunds</th><th style={{textAlign:'center'}}>Total</th><th style={{textAlign:'center'}}>Avg</th></tr></thead><tbody>{refundSummary.map(a => (<tr key={a.agent}><td style={{fontWeight:600}}>{a.agent}</td><td style={{textAlign:'center',color:'#3b82f6',fontWeight:600}}>{a.refundsProcessed}</td><td style={{textAlign:'center',color:'#ef4444'}}>{formatCurrency(a.totalAmount)}</td><td style={{textAlign:'center'}}>{formatCurrency(a.avgAmount)}</td></tr>))}</tbody></table></div></div>
        </div>)}

        {/* Chargebacks Section */}
        {activeSection === 'chargebacks' && (<div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <MetricCard title="Total Chargebacks" value={chargebackMidTotal?.chargebacks || filteredChargebacks.length} color="#ef4444" />
            <MetricCard title="Total Payments" value={(chargebackMidTotal?.payments || 0).toLocaleString()} color="#3b82f6" />
            <MetricCard title="CB Rate" value={chargebackMidTotal?.cbPct || 0} color="#f97316" />
            <MetricCard title="MIDs" value={chargebackMidData.length} color="#f59e0b" />
            <MetricCard title="Products" value={cbByProduct.length} color="#8b5cf6" />
          </div>

          {/* Monthly MID Report - From Sheet Rows 1-11 */}
          <div className="glass" style={{ padding: '16px', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📊 January MID Report</h3>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>MID</th>
                    <th style={{textAlign:'center'}}>Chargebacks</th>
                    <th style={{textAlign:'center'}}>Payments</th>
                    <th style={{textAlign:'center'}}>CB %</th>
                    <th style={{textAlign:'center'}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {chargebackMidData.map(m => (
                    <tr key={m.mid}>
                      <td style={{fontWeight:600}}>{m.mid}</td>
                      <td style={{textAlign:'center',color:'#ef4444',fontWeight:600}}>{m.chargebacks}</td>
                      <td style={{textAlign:'center'}}>{m.payments.toLocaleString()}</td>
                      <td style={{textAlign:'center'}}>
                        <span className="pill" style={{
                          background: m.cbPct >= 0.01 ? 'rgba(239,68,68,0.2)' : m.cbPct >= 0.005 ? 'rgba(234,179,8,0.2)' : 'rgba(16,185,129,0.2)', 
                          color: m.cbPct >= 0.01 ? '#ef4444' : m.cbPct >= 0.005 ? '#eab308' : '#10b981'
                        }}>{m.cbPct}</span>
                      </td>
                      <td style={{textAlign:'center'}}>
                        {m.cbPct >= 0.01 ? <span style={{color:'#ef4444'}}>⚠️ High</span> : 
                         m.cbPct >= 0.005 ? <span style={{color:'#eab308'}}>⚡ Warning</span> : 
                         <span style={{color:'#10b981'}}>✓ OK</span>}
                      </td>
                    </tr>
                  ))}
                  {chargebackMidTotal && (
                    <tr style={{background:'rgba(59,130,246,0.1)', fontWeight:700}}>
                      <td style={{fontWeight:700}}>Total/Avg</td>
                      <td style={{textAlign:'center',color:'#ef4444',fontWeight:700}}>{chargebackMidTotal.chargebacks}</td>
                      <td style={{textAlign:'center',fontWeight:700}}>{chargebackMidTotal.payments.toLocaleString()}</td>
                      <td style={{textAlign:'center'}}>
                        <span className="pill" style={{background:'rgba(139,92,246,0.2)', color:'#8b5cf6'}}>{chargebackMidTotal.cbPct}</span>
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {cbTrend.length > 1 && (<div className="glass" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📈 Chargebacks Trend</h3><ResponsiveContainer width="100%" height={200}><ComposedChart data={cbTrend}><XAxis dataKey="date" stroke="#475569" fontSize={9} tickFormatter={formatDate} /><YAxis yAxisId="left" stroke="#475569" fontSize={9} /><YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={9} tickFormatter={v => formatCurrency(v)} /><Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar yAxisId="left" dataKey="chargebacks" name="Count" fill="#ef4444" radius={[4, 4, 0, 0]} /><Line yAxisId="right" type="monotone" dataKey="amount" name="Amount" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div>)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>🏦 By Payment Method</h3><ResponsiveContainer width="100%" height={280}><BarChart data={cbByMid}><XAxis dataKey="mid" stroke="#475569" fontSize={9} angle={-45} textAnchor="end" height={80} /><YAxis stroke="#475569" fontSize={10} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="count" name="Chargebacks" fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
            <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📋 By Reason</h3><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={cbByReason.length ? cbByReason : [{reason:'No Data',count:1}]} dataKey="count" nameKey="reason" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label={({reason}) => reason?.substring(0, 12) || ''}>{cbByReason.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer></div>
          </div>
          <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📦 Chargeback Details by Product</h3><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Product</th><th style={{textAlign:'center'}}>Chargebacks</th><th style={{textAlign:'center'}}>Total Amount</th><th style={{textAlign:'center'}}>Avg Amount</th><th style={{textAlign:'left'}}>Top Reason</th></tr></thead><tbody>{cbByProduct.slice(0, 20).map(p => (<tr key={p.product}><td style={{fontWeight:600}}>{p.product}</td><td style={{textAlign:'center',color:'#ef4444',fontWeight:600}}>{p.count}</td><td style={{textAlign:'center',color:'#f97316'}}>{formatCurrency(p.amount)}</td><td style={{textAlign:'center'}}>{formatCurrency(p.count > 0 ? p.amount / p.count : 0)}</td><td style={{fontSize:'11px',color:'#94a3b8'}}>{p.topReason}</td></tr>))}</tbody></table></div></div>
        </div>)}

        {/* Business Section */}
        {activeSection === 'business' && (<div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <MetricCard title="Revenue" value={formatCurrency(bizSummary.totalRevenue)} color="#3b82f6" />
            <MetricCard title="Orders" value={bizSummary.totalOrders.toLocaleString()} color="#10b981" />
            <MetricCard title="Units" value={bizSummary.totalUnits.toLocaleString()} color="#8b5cf6" />
            <MetricCard title="COGS" value={formatCurrency(bizSummary.totalCogs)} color="#f97316" />
            <MetricCard title="Refunds" value={formatCurrency(bizSummary.totalRefunds)} color="#ef4444" />
            <MetricCard title="Ad Spend" value={formatCurrency(bizSummary.adSpend)} color="#f59e0b" />
            <MetricCard title="Net Profit" value={formatCurrency(bizSummary.netProfit)} color={bizSummary.netProfit >= 0 ? "#22c55e" : "#ef4444"} />
          </div>
          {bizByDate.length > 1 && (<div className="glass" style={{ padding: '16px', marginBottom: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📈 Revenue & Profit Trend</h3><ResponsiveContainer width="100%" height={220}><ComposedChart data={bizByDate}><XAxis dataKey="date" stroke="#475569" fontSize={9} tickFormatter={formatDate} /><YAxis stroke="#475569" fontSize={9} tickFormatter={v => formatCurrency(v)} /><Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} formatter={(v) => formatCurrency(v)} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" fill="rgba(59,130,246,0.2)" /><Line type="monotone" dataKey="profit" name="Profit" stroke="#22c55e" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📦 Revenue by Product</h3><ResponsiveContainer width="100%" height={280}><BarChart data={bizByProduct.slice(0, 10)} layout="vertical"><XAxis type="number" stroke="#475569" fontSize={9} tickFormatter={v => formatCurrency(v)} /><YAxis dataKey="product" type="category" stroke="#475569" width={100} fontSize={9} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(v)} /><Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
            <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>🏪 Revenue by Store</h3><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={bizByStore.slice(0, 10)} dataKey="revenue" nameKey="store" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label={({store}) => store?.substring(0, 8)}>{bizByStore.slice(0, 10).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(v)} /></PieChart></ResponsiveContainer></div>
          </div>
          <div className="glass" style={{ padding: '16px' }}><h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>📊 Product Performance</h3><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Product</th><th style={{textAlign:'right'}}>Revenue</th><th style={{textAlign:'right'}}>Orders</th><th style={{textAlign:'right'}}>Units</th><th style={{textAlign:'right'}}>COGS</th><th style={{textAlign:'right'}}>Refunds</th><th style={{textAlign:'right'}}>Ad Spend</th><th style={{textAlign:'right'}}>Profit</th></tr></thead><tbody>{bizByProduct.slice(0, 15).map(p => (<tr key={p.product}><td style={{fontWeight:600}}>{p.product}</td><td style={{textAlign:'right',color:'#3b82f6'}}>{formatCurrency(p.revenue)}</td><td style={{textAlign:'right'}}>{p.orders.toLocaleString()}</td><td style={{textAlign:'right'}}>{p.units.toLocaleString()}</td><td style={{textAlign:'right',color:'#f97316'}}>{formatCurrency(p.cogs)}</td><td style={{textAlign:'right',color:'#ef4444'}}>{formatCurrency(p.refunds)}</td><td style={{textAlign:'right',color:'#f59e0b'}}>{formatCurrency(p.adSpend)}</td><td style={{textAlign:'right',color:p.profit >= 0 ? '#22c55e' : '#ef4444'}}>{formatCurrency(p.profit)}</td></tr>))}</tbody></table></div></div>
        </div>)}
      </main>
    </div>
  );
}
