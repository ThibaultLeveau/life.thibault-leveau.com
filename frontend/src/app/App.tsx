import { AppLayout } from '../components/layout/AppLayout';
import { HomePage } from '../pages/HomePage';
import { TasksPage } from '../features/tasks/TasksPage';

export function App() {
  if (window.location.pathname === '/tasks') return <TasksPage />;
  return (
    <AppLayout>
      <HomePage />
    </AppLayout>
  );
}
