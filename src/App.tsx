import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import ShipmentDetail from './components/ShipmentDetail';
import ContainerDetail from './components/ContainerDetail';
import UserManagement from './components/UserManagement';
import ForceResetPassword from './components/ForceResetPassword';
import { fetchShipments } from './data/store';
import { Shipment } from './types';

type View =
  | { page: 'dashboard' }
  | { page: 'detail'; id: string }
  | { page: 'container'; container: string }
  | { page: 'users' };

function AppInner() {
  const { session, profile, loading } = useAuth();
  const [view, setView] = useState<View>({ page: 'dashboard' });
  const [allShipments, setAllShipments] = useState<Shipment[]>([]);
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
    return <ForceResetPassword />;
  }

  async function handleView(id: string) {
    const shipments = await fetchShipments();
    setAllShipments(shipments);
    const found = shipments.find((s) => s.id === id);
    if (found) {
      setDetailShipment(found);
      setView({ page: 'detail', id });
    }
  }

  async function handleViewContainer(container: string) {
    const shipments = await fetchShipments();
    setAllShipments(shipments);
    setView({ page: 'container', container });
  }

  if (view.page === 'detail' && detailShipment) {
    return (
      <ShipmentDetail
        shipment={detailShipment}
        onBack={() => { setView({ page: 'dashboard' }); setDetailShipment(null); }}
      />
    );
  }

  if (view.page === 'container') {
    const containerShipments = allShipments.filter((s) => (s.container || '(no container)') === view.container);
    return (
      <ContainerDetail
        container={view.container}
        shipments={containerShipments}
        onBack={() => setView({ page: 'dashboard' })}
        onViewShipment={(id) => handleView(id)}
      />
    );
  }

  if (view.page === 'users') {
    return <UserManagement onBack={() => setView({ page: 'dashboard' })} />;
  }

  return (
    <Dashboard
      onView={handleView}
      onViewContainer={handleViewContainer}
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
