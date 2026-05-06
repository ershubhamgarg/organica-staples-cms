import { Plus, Edit2, Trash2, Image as ImageIcon } from 'lucide-react';

export default function Products() {
  const products = [
    { id: 1, name: 'Organic Quinoa', category: 'Grains', price: '$12.99', stock: 150, status: 'In Stock' },
    { id: 2, name: 'Wild Forest Honey', category: 'Sweeteners', price: '$18.50', stock: 45, status: 'Low Stock' },
    { id: 3, name: 'Cold Pressed Olive Oil', category: 'Oils', price: '$24.00', stock: 80, status: 'In Stock' },
    { id: 4, name: 'Himalayan Pink Salt', category: 'Seasoning', price: '$8.50', stock: 0, status: 'Out of Stock' },
  ];

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">Manage your organic product inventory.</p>
        </div>
        <button className="btn btn-primary">
          <Plus size={18} />
          Add Product
        </button>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <th style={{ padding: '12px 16px', fontWeight: 500, width: '60px' }}>Image</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Category</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Price</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Stock</th>
                <th style={{ padding: '12px 16px', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 500, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '16px' }}>
                    <div style={{ width: '40px', height: '40px', background: 'var(--bg-tertiary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      <ImageIcon size={20} />
                    </div>
                  </td>
                  <td style={{ padding: '16px', fontWeight: 600 }}>{product.name}</td>
                  <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{product.category}</td>
                  <td style={{ padding: '16px', fontWeight: 500 }}>{product.price}</td>
                  <td style={{ padding: '16px' }}>{product.stock} units</td>
                  <td style={{ padding: '16px' }}>
                    <span className={`badge badge-${product.status === 'In Stock' ? 'success' : product.status === 'Low Stock' ? 'warning' : 'danger'}`}>
                      {product.status}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button className="btn-ghost" style={{ padding: '6px', borderRadius: '6px', color: 'var(--text-secondary)' }}>
                        <Edit2 size={16} />
                      </button>
                      <button className="btn-ghost" style={{ padding: '6px', borderRadius: '6px', color: 'var(--danger)' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
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
