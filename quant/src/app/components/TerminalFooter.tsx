export default function TerminalFooter() {
  return (
    <footer className="mt-8 flex flex-col gap-2 border-t border-[#26303a] py-5 text-xs text-[#60707e] sm:flex-row sm:items-center sm:justify-between">
      <p>Research terminal · No execution connectivity</p>
      <div className="flex gap-4">
        <a className="hover:text-[#38d9a9] focus:outline-none focus:ring-2 focus:ring-[#38d9a9]" href="https://bhavyarjohar.com/" target="_blank" rel="noopener noreferrer">Bhavya Johar</a>
        <a className="hover:text-[#38d9a9] focus:outline-none focus:ring-2 focus:ring-[#38d9a9]" href="https://github.com/BhavyaJohar/Options" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a className="hover:text-[#38d9a9] focus:outline-none focus:ring-2 focus:ring-[#38d9a9]" href="https://www.linkedin.com/in/bhavya-johar-5571b4170/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      </div>
    </footer>
  );
}
