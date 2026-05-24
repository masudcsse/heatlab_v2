function PlaceTypeSelect({ value, onChange }) {
  return (
    <>
      <label>Place Type</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="All">All Place Types</option>
        <option value="Outdoor">Outdoor</option>
        <option value="Indoor">Indoor</option>
        <option value="Historical">Historical</option>
        <option value="Park / Garden">Park / Garden</option>
        <option value="Food/Cafe">Food/Cafe</option>
        <option value="Public Space">Public Space</option>
        <option value="Recreational Area">Recreational Area</option>
      </select>
    </>
  );
}

export default PlaceTypeSelect;
