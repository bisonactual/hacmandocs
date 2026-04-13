import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DocumentPage from "./pages/DocumentPage";
import ProposalPage from "./pages/ProposalPage";
import ProposeEditPage from "./pages/ProposeEditPage";
import SearchPage from "./pages/SearchPage";
import AdminLayout from "./pages/admin/AdminLayout";
import UsersPage from "./pages/admin/UsersPage";
import ImportPage from "./pages/admin/ImportPage";
import ExportPage from "./pages/admin/ExportPage";
import CategoriesPage from "./pages/admin/CategoriesPage";
import GroupsPage from "./pages/admin/GroupsPage";

function HomePage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800">Welcome</h2>
      <p className="mt-2 text-gray-600">
        Select a document from the sidebar to get started.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Public layout — documents, search, home are readable without login */}
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/documents/:id" element={<DocumentPage />} />
        <Route path="/search" element={<SearchPage />} />

        {/* Protected routes — require login */}
        <Route
          path="/documents/:id/propose"
          element={
            <ProtectedRoute>
              <ProposeEditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/proposals/:id"
          element={
            <ProtectedRoute>
              <ProposalPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="export" element={<ExportPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
