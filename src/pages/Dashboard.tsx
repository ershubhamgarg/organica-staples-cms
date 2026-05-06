import { TrendingUp, Users, ShoppingBag, DollarSign } from 'lucide-react';

export default function Dashboard() {
  const stats = [
    { label: 'Total Revenue', value: '$24,560', icon: DollarSign, trend: '+12.5%', color: 'var(--accent-primary)' },
    { label: 'Total Orders', value: '450', icon: ShoppingBag, trend: '+8.2%', color: '#3b82f6' },
    { label: 'Active Customers', value: '1,240', icon: Users, trend: '+2.4%', color: '#8b5cf6' },
    { label: 'Conversion Rate', value: '3.6%', icon: TrendingUp, trend: '+1.1%', color: '#f59e0b' },
  ];

  const recentOrders = [
    { id: '#ORD-001', customer: 'Alice Smith', product: 'Organic Quinoa', total: '$24.50', status: 'Delivered' },
    { id: '#ORD-002', customer: 'Bob Johnson', product: 'Wild Honey', total: '$18.00', status: 'Processing' },
    { id: '#ORD-003', customer: 'Charlie Brown', product: 'Almond Butter', total: '$32.00', status: 'Shipped' },
    { id: '#ORD-004', customer: 'Diana Prince', product: 'Chia Seeds', total: '$15.50', status: 'Pending' },
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Welcome back! Here's an overview of your store.</p>

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
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{stat.trend}</span>
              <span style={{ color: 'var(--text-secondary)' }}>vs last month</span>
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
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Product</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Total</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px', fontWeight: 600 }}>{order.id}</td>
                  <td style={{ padding: '16px' }}>{order.customer}</td>
                  <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{order.product}</td>
                  <td style={{ padding: '16px', fontWeight: 500 }}>{order.total}</td>
                  <td style={{ padding: '16px' }}>
                    <span className={`badge badge-${order.status === 'Delivered' ? 'success' : order.status === 'Processing' ? 'warning' : 'danger'}`}>
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
