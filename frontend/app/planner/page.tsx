export default function Planner() {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">
          Study Planner
        </h2>
  
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {["To Do", "Doing", "Done"].map((status) => (
            <div
              key={status}
              className="bg-white p-4 rounded shadow"
            >
              <h3 className="font-semibold mb-3">{status}</h3>
  
              <div className="bg-gray-100 p-3 rounded text-sm">
                Physics – Motion
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  