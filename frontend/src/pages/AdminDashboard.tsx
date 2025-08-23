import { useNavigate } from "react-router-dom";
import PageDataEditor from "../components/PageDataEditor";
import AudioList from "../components/AudioList";

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)} // goes back one step in history
        className="mb-6 text-sm text-secondary hover:text-gray-400 transition-colors flex items-center gap-1"
        aria-label="Go back"
      >
        ← Back
      </button>

      {/* Components Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="w-full">
          <AudioList />
        </div>
        <div className="w-full">
          <PageDataEditor />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
