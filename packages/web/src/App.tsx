import { Routes, Route, Navigate, Link } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import DocumentPage from "./pages/DocumentPage";
import ProposalPage from "./pages/ProposalPage";
import ProposeEditPage from "./pages/ProposeEditPage";
import ProposeDeletePage from "./pages/ProposeDeletePage";
import CreateDocumentPage from "./pages/CreateDocumentPage";
import SearchPage from "./pages/SearchPage";
import AdminLayout from "./pages/admin/AdminLayout";
import UsersPage from "./pages/admin/UsersPage";
import ImportPage from "./pages/admin/ImportPage";
import ExportPage from "./pages/admin/ExportPage";
import CategoriesPage from "./pages/admin/CategoriesPage";
import GroupsPage from "./pages/admin/GroupsPage";
import MemberProfilePage from "./pages/inductions/MemberProfilePage";
import QuizTakingPage from "./pages/inductions/QuizTakingPage";
import TrainerDashboardPage from "./pages/inductions/TrainerDashboardPage";
import SignoffFormPage from "./pages/inductions/SignoffFormPage";
import ChecklistPage from "./pages/inductions/ChecklistPage";
import RiskAssessmentPage from "./pages/inductions/RiskAssessmentPage";
import EditRiskAssessmentPage from "./pages/inductions/EditRiskAssessmentPage";
import ProposeRAEditPage from "./pages/inductions/ProposeRAEditPage";
import RAProposalPage from "./pages/RAProposalPage";
import ToolsPage from "./pages/admin/ToolsPage";
import QuizzesPage from "./pages/admin/QuizzesPage";
import EditQuizDescriptionPage from "./pages/admin/EditQuizDescriptionPage";
import AreasPage from "./pages/admin/AreasPage";
import ProposalsPage from "./pages/admin/ProposalsPage";
import RecycleBinPage from "./pages/admin/RecycleBinPage";
import ImportRiskAssessmentsPage from "./pages/admin/ImportRiskAssessmentsPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import SetUsernamePage from "./pages/SetUsernamePage";
import { useAuth } from "./hooks/useAuth";

function HomePage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-4">
      {/* Welcome banner */}
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark p-8">
        <h2 className="text-2xl font-bold text-hacman-text">
          {user ? `Welcome back, ${user.name || user.email}` : "Welcome to HACMAN"}
        </h2>
        <p className="mt-2 text-hacman-muted">
          Documentation &amp; Training Portal for Hackspace Manchester
        </p>
        {!user && (
          <div className="mt-4 flex items-center gap-4">
            <Link
              to="/login"
              className="rounded-lg bg-hacman-yellow px-5 py-2.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors"
            >
              Sign in for training
            </Link>
            <span className="text-sm text-hacman-muted">
              or browse the docs freely — no account needed
            </span>
          </div>
        )}
      </div>

      {/* Quick actions for logged-in users */}
      {user && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to="/inductions/profile"
            className="group rounded-xl border border-hacman-gray bg-hacman-dark p-5 transition-all hover:border-hacman-yellow/50 hover:shadow-lg hover:shadow-hacman-yellow/5"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-hacman-yellow/10 text-xl">
              🎓
            </div>
            <h3 className="font-semibold text-hacman-text group-hover:text-hacman-yellow transition-colors">
              My Training
            </h3>
            <p className="mt-1 text-sm text-hacman-muted">
              View certifications, take quizzes, and track your progress
            </p>
          </Link>

          <Link
            to="/inductions/trainer"
            className="group rounded-xl border border-hacman-gray bg-hacman-dark p-5 transition-all hover:border-hacman-yellow/50 hover:shadow-lg hover:shadow-hacman-yellow/5"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-hacman-yellow/10 text-xl">
              👨‍🏫
            </div>
            <h3 className="font-semibold text-hacman-text group-hover:text-hacman-yellow transition-colors">
              Trainer Dashboard
            </h3>
            <p className="mt-1 text-sm text-hacman-muted">
              Manage sign-offs and review member inductions
            </p>
          </Link>

          <Link
            to="/search"
            className="group rounded-xl border border-hacman-gray bg-hacman-dark p-5 transition-all hover:border-hacman-yellow/50 hover:shadow-lg hover:shadow-hacman-yellow/5"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-hacman-yellow/10 text-xl">
              🔍
            </div>
            <h3 className="font-semibold text-hacman-text group-hover:text-hacman-yellow transition-colors">
              Search Docs
            </h3>
            <p className="mt-1 text-sm text-hacman-muted">
              Find documentation, guides, and training materials
            </p>
          </Link>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link to="/search" className="group rounded-xl border border-hacman-gray bg-hacman-dark p-5 transition-all hover:border-hacman-yellow/50 hover:shadow-lg hover:shadow-hacman-yellow/5">
          <h3 className="flex items-center gap-2 font-semibold text-hacman-text group-hover:text-hacman-yellow transition-colors">
            <span className="text-hacman-yellow">📄</span> Documentation
          </h3>
          <p className="mt-2 text-sm text-hacman-muted">
            Browse workshop guides, equipment manuals, and safety procedures using the sidebar navigation. No login required.
          </p>
        </Link>
        <Link to={user ? "/inductions/profile" : "/login"} className="group rounded-xl border border-hacman-gray bg-hacman-dark p-5 transition-all hover:border-hacman-yellow/50 hover:shadow-lg hover:shadow-hacman-yellow/5">
          <h3 className="flex items-center gap-2 font-semibold text-hacman-text group-hover:text-hacman-yellow transition-colors">
            <span className="text-hacman-yellow">🔧</span> Tool Training
          </h3>
          <p className="mt-2 text-sm text-hacman-muted">
            Complete inductions for workshop tools. Take online inductions and complete refresher courses.
          </p>
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();

  // If logged in but no username set, show the username prompt
  if (user && !user.username) {
    return <SetUsernamePage onComplete={() => window.location.reload()} />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Public layout — documents, search, home are readable without login */}
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/documents/new"
          element={
            <ProtectedRoute>
              <CreateDocumentPage />
            </ProtectedRoute>
          }
        />
        <Route path="/documents/:id" element={<DocumentPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />

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
          path="/documents/:id/propose-delete"
          element={
            <ProtectedRoute>
              <ProposeDeletePage />
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
          path="/inductions/profile"
          element={
            <ProtectedRoute>
              <MemberProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inductions/quiz/:id"
          element={
            <ProtectedRoute>
              <QuizTakingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inductions/trainer"
          element={
            <ProtectedRoute>
              <TrainerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inductions/signoff/:toolId"
          element={
            <ProtectedRoute>
              <SignoffFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inductions/checklist/:toolId"
          element={
            <ProtectedRoute>
              <ChecklistPage />
            </ProtectedRoute>
          }
        />
        <Route path="/inductions/risk-assessment/:toolId" element={<RiskAssessmentPage />} />
        <Route
          path="/inductions/risk-assessment/:toolId/edit"
          element={
            <ProtectedRoute>
              <EditRiskAssessmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inductions/risk-assessment/:toolId/propose"
          element={
            <ProtectedRoute>
              <ProposeRAEditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ra-proposals/:id"
          element={
            <ProtectedRoute>
              <RAProposalPage />
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
          <Route path="areas" element={<AreasPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="quizzes" element={<QuizzesPage />} />
          <Route path="quizzes/:id/description" element={<EditQuizDescriptionPage />} />
          <Route path="proposals" element={<ProposalsPage />} />
          <Route path="recycle-bin" element={<RecycleBinPage />} />
          <Route path="risk-assessments/import" element={<ImportRiskAssessmentsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
