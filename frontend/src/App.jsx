import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/ui/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AssetsPage from './pages/AssetsPage'
import AssetDetailPage from './pages/AssetDetailPage'
import AssetFormPage from './pages/AssetFormPage'
import TransfersPage from './pages/TransfersPage'
import TransferFormPage from './pages/TransferFormPage'
import TransferDetailPage from './pages/TransferDetailPage'
import MaintenancePage from './pages/MaintenancePage'
import LifecyclePage from './pages/LifecyclePage'
import ConfigPage from './pages/ConfigPage'
import DepartmentsPage from './pages/DepartmentsPage'
import AssetTypesPage from './pages/AssetTypesPage'
import LocationPage from './pages/LocationPage'
import TrashPage from './pages/TrashPage'

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"          element={<DashboardPage />} />
        <Route path="assets"             element={<AssetsPage />} />
        <Route path="assets/new"         element={<AssetFormPage />} />
        <Route path="assets/:id/edit"    element={<AssetFormPage />} />
        <Route path="assets/:id"         element={<AssetDetailPage />} />
        <Route path="transfers"          element={<TransfersPage />} />
        <Route path="transfers/new"      element={<TransferFormPage />} />
        <Route path="transfers/:id"      element={<TransferDetailPage />} />
        <Route path="maintenance"        element={<MaintenancePage />} />
        <Route path="lifecycle"          element={<LifecyclePage />} />
        <Route path="locations"          element={<LocationPage />} />
        <Route path="departments"        element={<DepartmentsPage />} />
        <Route path="asset-types"        element={<AssetTypesPage />} />
        <Route path="config"             element={<ConfigPage />} />
        <Route path="trash"              element={<TrashPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
