
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
// Fix: Change NetworkElement to NetworkNode to match the exported type in types.ts
import { NetworkNode, NodeType } from '../types';

interface Props {
  elements: NetworkNode[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const LossBreakdownChart: React.FC<Props> = ({ elements }) => {
  const data = React.useMemo(() => {
    const summary = elements.reduce((acc, curr) => {
      if (curr.type === NodeType.OLT || curr.type === NodeType.ONU) return acc;
      acc[curr.type] = (acc[curr.type] || 0) + curr.loss;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(summary).map(([name, value]) => ({
      name,
      // Fix: Cast 'value' to number to resolve 'unknown' type inference issue
      value: parseFloat((value as number).toFixed(2))
    }));
  }, [elements]);

  if (data.length === 0) return null;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LossBreakdownChart;
