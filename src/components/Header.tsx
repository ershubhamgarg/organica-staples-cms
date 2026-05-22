import { Bell, Search } from 'lucide-react';

export default function Header() {
  return (
    <header style={{
      height: '70px',
      borderBottom: '1px solid var(--border-color)',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 2rem',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
      <div style={{ position: 'relative', width: '300px' }}>
        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input 
          type="text" 
          placeholder="Search products, orders..." 
          className="input-field"
          style={{ paddingLeft: '38px', borderRadius: 'var(--radius-full)', background: 'var(--bg-secondary)', border: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <button className="btn-ghost" style={{ position: 'relative', padding: '8px', borderRadius: '50%' }}>
          <Bell size={20} />
          <span style={{ 
            position: 'absolute', 
            top: '4px', 
            right: '4px', 
            width: '8px', 
            height: '8px', 
            background: 'var(--danger)', 
            borderRadius: '50%',
            border: '2px solid var(--bg-primary)'
          }}></span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Pantry Admin</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>admin@amritya.com</div>
          </div>
          <img 
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" 
            alt="Profile" 
            style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-tertiary)' }}
          />
        </div>
      </div>
    </header>
  );
}
