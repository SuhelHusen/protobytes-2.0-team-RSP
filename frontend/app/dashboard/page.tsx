export default function Dashboard() {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">
          Welcome 👋
        </h2>
  
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded shadow">
            <h3 className="font-semibold mb-2">📅 Exam Countdown</h3>
            <p>SEE Exam: 25 days left</p>
          </div>
  
          <div className="bg-white p-6 rounded shadow">
            <h3 className="font-semibold mb-2">📚 Today’s Plan</h3>
            <ul className="list-disc ml-5">
              <li>Physics – Laws of Motion</li>
              <li>Math – Trigonometry</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }
  