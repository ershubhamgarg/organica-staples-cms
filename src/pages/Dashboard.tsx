import { useEffect } from 'react';
import { TrendingUp, Users, ShoppingBag, DollarSign, Package, Loader2 } from 'lucide-react';
import { useStatsStore } from '../store/statsStore';

export default function Dashboard() {
  const { 
    totalRevenue, 
    totalOrders, 
    totalProducts, 
    totalCustomers, 
    recentOrders, 
    isLoading, 
    error, 
    fetchStats 
  } = useStatsStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const stats = [
    { 
      label: 'Total Revenue', 
      value: `₹${totalRevenue.toLocaleString()}`, 
      icon: DollarSign, 
      color: 'var(--accent-primary)' 
    },
    { 
      label: 'Total Orders', 
      value: totalOrders.toString(), 
      icon: ShoppingBag, 
      color: '#3b82f6' 
    },
    { 
      label: 'Total Products', 
      value: totalProducts.toString(), 
      icon: Package, 
      color: '#f59e0b' 
    },
    { 
      label: 'Total Customers', 
      value: totalCustomers.toString(), 
      icon: Users, 
      color: '#8b5cf6' 
    },
  ];

  if (isLoading && totalOrders === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Loader2 className="animate-spin" size={48} color="var(--accent-primary)" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Welcome back! Here's an overview of your store from real-time data.</p>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: 'var(--danger-light)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {stats.map((stat, idx) => (
          <div key={idx} className="glass-card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>{stat.label}</p>
                <h3 style={{ fontSize: '1.8rem', fontWeight: 700 }}>{stat.value}</h3>
              </div>
              <div style={{ background: `${stat.color}20`, padding: '10px', borderRadius: '12px', color: stat.color }}>
                <stat.icon size={24} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Real-time</span>
              <span style={{ color: 'var(--text-secondary)' }}>from Database</span>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem' }}>Recent Orders</h3>
          <button className="btn btn-ghost">View All</button>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Order ID</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Customer</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Total</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length > 0 ? (
                recentOrders.map((order, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '16px', fontWeight: 600 }}>{order.id}</td>
                    <td style={{ padding: '16px' }}>{order.customer}</td>
                    <td style={{ padding: '16px', fontWeight: 500 }}>{order.total}</td>
                    <td style={{ padding: '16px' }}>
                      <span className={`badge badge-${order.status.toLowerCase() === 'delivered' ? 'success' : order.status.toLowerCase() === 'pending' ? 'warning' : 'info'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{order.date}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No recent orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
