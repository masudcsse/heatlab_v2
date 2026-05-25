function ActivityPreferenceSelect({ value, onChange }) {
  return (
    <>
      <label>Activity Preference</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="All">All Activities</option>
        <option value="Nearby Drinking Water">Nearby Drinking Water</option>
        <option value="Shaded Area">Shaded Area</option>
        <option value="Indoor Activity">Indoor Activity</option>
{/*         <option value="Walking">Walking</option>
        <option value="Sightseeing">Sightseeing</option>
        <option value="Cycling">Cycling</option>
        <option value="Relaxing">Relaxing</option>
        <option value="Family activity">Family activity</option>
        <option value="Photography">Photography</option>
        <option value="Food/Cafe">Food/Cafe</option>
        <option value="Indoor visit">Indoor visit</option> */}
      </select>
    </>
  );
}

export default ActivityPreferenceSelect;
