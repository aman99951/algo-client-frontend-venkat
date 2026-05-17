import React from 'react'

function StatCard({ label, value, icon, color, bgColor }) {
  return (
    <div className={`${bgColor} rounded-xl p-2.5 border border-gray-100`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`${color} hidden sm:block`}>{icon}</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wide leading-tight">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color} leading-tight`}>{value}</div>
    </div>
  )
}

export default StatCard
