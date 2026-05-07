import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import ShipmentDetail from './components/ShipmentDetail';
import UserManagement from './components/UserManagement';
import ForceResetPassword from './components/ForceResetPassword';
import { fetchShipments } from './data/store';
import { Shipment } from './types';

type View = { page: 'dashboard' } | { page: 'detail'; id: string } | { page: 'users' };

function AppInner() {
  const { session, profile, loading } = useAuth();
  const [view, setView] = useState<View>({ page: 'dashboard' });
  const [detailShipment, setDetailShipment] = useState<Shipment | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginPage />;

  if (profile?.must_reset_password) {
    return <ForceResetPassword onDone={() => window.location.reload()} />;
  }

  async function handleView(id: string) {
    const shipments = await fetchShipments();
    const found = shipments.find((s) => s.id === id);
    if (found) {
      setDetailShipment(found);
      setView({ page: 'detail', id });
    }
  }

  if (view.page === 'detail' && detailShipment) {
    return (
      <ShipmentDetail
        shipment={detailShipment}
        onBack={() => { setView({ page: 'dashboard' }); setDetailShipment(null); }}
      />
    );
  }

  if (view.page === 'users') {
    return <UserManagement onBack={() => setView({ page: 'dashboard' })} />;
  }

  return (
    <Dashboard
      onView={handleView}
      onUserManagement={() => setView({ page: 'users' })}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
